# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'fileutils'
require 'openssl'

module PapaSys
  module Paginacao
    module Updater
      LOCAL_RBZ_PATHS = [
        'd:/COISAS/SISTEMAS/PapaSys/sketchup_plugin/papasys_paginacao.rbz',
        'd:/COISAS/SISTEMAS/PapaSys/sistema_web/plugin/papasys_paginacao.rbz',
        File.expand_path('../../sketchup_plugin/papasys_paginacao.rbz', File.dirname(__FILE__)),
        File.expand_path('../../../sketchup_plugin/papasys_paginacao.rbz', File.dirname(__FILE__))
      ].freeze

      LOCAL_VERSION_JSON = 'd:/COISAS/SISTEMAS/PapaSys/sistema_web/plugin/version.json'.freeze

      def self.verificar_pacote_local
        caminho_rbz = LOCAL_RBZ_PATHS.find { |p| File.exist?(p) && File.size(p) > 500 }
        return nil unless caminho_rbz

        versao = nil
        changelog = 'Versão PapaSys v1.1.0: Live preview, snap centro/canto, perda 10%/15% e layout compacto sem scroll.'

        if File.exist?(LOCAL_VERSION_JSON)
          begin
            data = JSON.parse(File.read(LOCAL_VERSION_JSON))
            versao = data['version']
            changelog = data['changelog'] if data['changelog']
          rescue => e
            puts "[PapaSys Updater] Erro ao ler version.json local: #{e.message}"
          end
        end

        versao ||= '1.1.0'
        { rbz: caminho_rbz, version: versao, changelog: changelog }
      end

      def self.recarregar_modulos
        begin
          plugins_dir = File.dirname(File.dirname(__FILE__))
          base = File.join(plugins_dir, 'papasys_paginacao')
          ['version.rb', 'config.rb', 'geom_engine.rb', 'api_client.rb', 'updater.rb', 'ui_dialog.rb'].each do |f|
            arq = File.join(base, f)
            load arq if File.exist?(arq)
          end
          puts "[PapaSys Updater] ✅ Módulos recarregados com sucesso!"
        rescue => e
          puts "[PapaSys Updater] Aviso ao recarregar módulos: #{e.message}"
        end
      end

      def self.instalar_rbz_local(pacote_local, callback)
        puts "[PapaSys Updater] Instalando pacote local: #{pacote_local[:rbz]} (v#{pacote_local[:version]})"
        sucesso = Sketchup.install_from_archive(pacote_local[:rbz])
        recarregar_modulos if sucesso

        UI.start_timer(0, false) do
          if sucesso
            msg = "O #{PLUGIN_NAME} foi atualizado com sucesso para v#{pacote_local[:version]}!\n\n#{pacote_local[:changelog]}"
            UI.messagebox(msg, MB_OK)
            callback.call(true, pacote_local[:version], pacote_local[:changelog]) if callback
          else
            UI.messagebox("Falha ao instalar atualização a partir do pacote local.", MB_OK)
            callback.call(false, nil, "Falha na instalação local") if callback
          end
        end
        sucesso
      end

      # Verifica se há atualizações disponíveis no servidor web, Supabase ou pacote local
      def self.check(silent: false, auto_install: true, &callback)
        Thread.new do
          begin
            # 1. Verifica se existe pacote local atualizado
            pacote_local = verificar_pacote_local
            versao_local_maior = false
            if pacote_local
              versao_local_maior = (Gem::Version.new(pacote_local[:version]) > Gem::Version.new(VERSION) rescue (pacote_local[:version] != VERSION))
            end

            # Se há pacote local mais recente, instala diretamente sem depender de internet
            if pacote_local && versao_local_maior
              puts "[PapaSys Updater] Pacote local mais novo detectado: v#{pacote_local[:version]}"
              instalar_rbz_local(pacote_local, callback)
              next
            end

            # 2. Tenta verificar online
            base_url = Config.server_url
            houve_sucesso_remoto = false

            if base_url && !base_url.empty?
              url_check = base_url.include?('supabase.co') ? "#{base_url}/storage/v1/object/public/plugin/version.json" : "#{base_url}/api/plugin/latest?current=#{VERSION}&ts=#{Time.now.to_i}"
              begin
                uri = URI.parse(url_check)
                http = Net::HTTP.new(uri.host, uri.port)
                http.use_ssl = (uri.scheme == 'https')
                http.verify_mode = OpenSSL::SSL::VERIFY_NONE if http.use_ssl?
                http.open_timeout = 4
                http.read_timeout = 8

                request = Net::HTTP::Get.new(uri.request_uri)
                request['User-Agent'] = "SketchUp-PapaSysPlugin/#{VERSION}"
                request['Accept'] = 'application/json'

                response = http.request(request)

                if response.code.to_i == 200
                  data = JSON.parse(response.body)
                  remote_ver = data['version']
                  download_url = data['download_url']
                  changelog = data['changelog'] || 'Melhorias de desempenho e correções.'

                  has_update = Gem::Version.new(remote_ver) > Gem::Version.new(VERSION) rescue (remote_ver != VERSION)

                  if has_update
                    houve_sucesso_remoto = true
                    puts "[PapaSys Updater] Nova versão remota disponível: v#{remote_ver} (Atual: v#{VERSION})"
                    sucesso = baixar_e_instalar(download_url, remote_ver)
                    recarregar_modulos if sucesso
                    UI.start_timer(0, false) do
                      if sucesso
                        msg = "O #{PLUGIN_NAME} foi atualizado automaticamente para a versão v#{remote_ver}!\n\nNovidades:\n#{changelog}"
                        UI.messagebox(msg, MB_OK)
                        callback.call(true, remote_ver, changelog) if callback
                      else
                        UI.messagebox("Tentativa de atualizar para v#{remote_ver} falhou. Verifique sua conexão.", MB_OK) unless silent
                        callback.call(false, nil, "Falha na instalação") if callback
                      end
                    end
                    next
                  else
                    houve_sucesso_remoto = true
                    puts "[PapaSys Updater] Plugin já está na versão mais recente (v#{VERSION})."
                    UI.start_timer(0, false) do
                      UI.messagebox("#{PLUGIN_NAME} já está atualizado (v#{VERSION}).", MB_OK) unless silent
                      callback.call(false, VERSION, "Versão atual (v#{VERSION}) já é a mais recente.") if callback
                    end
                    next
                  end
                end
              rescue => net_err
                puts "[PapaSys Updater] Aviso na verificação remota: #{net_err.message}"
              end
            end

            # 3. Fallback: Se o servidor remoto não tem bucket/falhou, mas existe pacote local:
            if pacote_local
              puts "[PapaSys Updater] Aplicando atualização do pacote local..."
              instalar_rbz_local(pacote_local, callback)
            else
              UI.start_timer(0, false) do
                UI.messagebox("#{PLUGIN_NAME} (v#{VERSION}): Servidor de atualização não configurado e nenhum arquivo .rbz local encontrado.", MB_OK) unless silent
                callback.call(false, nil, "Nenhuma atualização encontrada") if callback
              end
            end
          rescue => e
            puts "[PapaSys Updater] Erro geral ao verificar atualizações: #{e.message}"
            UI.start_timer(0, false) do
              UI.messagebox("Erro ao verificar atualizações: #{e.message}", MB_OK) unless silent
              callback.call(false, nil, e.message) if callback
            end
          end
        end
      end

      def self.baixar_e_instalar(url_str, version_str)
        puts "[PapaSys Updater] Baixando atualização de: #{url_str}"
        uri = URI.parse(url_str)
        temp_dir = Sketchup.temp_dir rescue (ENV['TEMP'] || '/tmp')
        temp_file = File.join(temp_dir, "papasys_paginacao_v#{version_str}_#{Time.now.to_i}.rbz")

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.verify_mode = OpenSSL::SSL::VERIFY_NONE if http.use_ssl?
        http.open_timeout = 10
        http.read_timeout = 30

        request = Net::HTTP::Get.new(uri.request_uri)
        request['User-Agent'] = "SketchUp-PapaSysPlugin/#{VERSION}"

        http.request(request) do |response|
          if response.code.to_i == 200 || response.code.to_i == 302
            if response.code.to_i == 302 && response['location']
              return baixar_e_instalar(response['location'], version_str)
            end

            File.open(temp_file, 'wb') do |io|
              response.read_body do |chunk|
                io.write(chunk)
              end
            end
          else
            puts "[PapaSys Updater] Erro no download: HTTP #{response.code}"
            return false
          end
        end

        unless File.exist?(temp_file) && File.size(temp_file) > 100
          puts "[PapaSys Updater] Arquivo baixado é inválido ou vazio."
          return false
        end

        puts "[PapaSys Updater] Instalando extensão de: #{temp_file}"
        sucesso = Sketchup.install_from_archive(temp_file)
        puts "[PapaSys Updater] Instalação concluída com status: #{sucesso}"

        File.delete(temp_file) rescue nil
        sucesso
      rescue => e
        puts "[PapaSys Updater] Falha crítica no download/instalação: #{e.message}"
        false
      end

      def self.start_auto_check
        return unless Config.auto_update?

        agora = Time.now.to_i
        ultimo = Config.last_check_time
        if (agora - ultimo) > 7200
          Config.last_check_time = agora
          UI.start_timer(3, false) do
            check(silent: true, auto_install: true)
          end
        end
      end
    end
  end
end
