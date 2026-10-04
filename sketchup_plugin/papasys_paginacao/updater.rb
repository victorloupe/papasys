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

      def self.instalar_rbz_local(pacote_local, silent: false, &callback)
        puts "[PapaSys Updater] Instalando pacote local: #{pacote_local[:rbz]} (v#{pacote_local[:version]})"
        sucesso = Sketchup.install_from_archive(pacote_local[:rbz])
        recarregar_modulos if sucesso

        UI.start_timer(0.1, false) do
          if sucesso
            unless silent
              msg = "O #{PLUGIN_NAME} foi atualizado com sucesso para v#{pacote_local[:version]}!\n\n#{pacote_local[:changelog]}"
              UI.messagebox(msg, MB_OK)
            end
            callback.call(true, pacote_local[:version], pacote_local[:changelog]) if callback
          else
            UI.messagebox("Falha ao instalar atualização a partir do pacote local.", MB_OK) unless silent
            callback.call(false, nil, "Falha na instalação local") if callback
          end
        end
        sucesso
      rescue => e
        puts "[PapaSys Updater] Erro ao instalar RBZ local: #{e.message}"
        callback.call(false, nil, e.message) if callback
        false
      end

      # Verifica se há atualizações disponíveis sem bloquear a thread principal do SketchUp
      def self.check(silent: false, auto_install: true, &callback)
        # 1. Verifica se existe pacote local com versão ESTRITAMENTE maior que a atual
        pacote_local = verificar_pacote_local
        versao_local_maior = false
        if pacote_local
          versao_local_maior = (Gem::Version.new(pacote_local[:version]) > Gem::Version.new(VERSION) rescue false)
        end

        if pacote_local && versao_local_maior && auto_install
          puts "[PapaSys Updater] Pacote local mais novo detectado: v#{pacote_local[:version]} (Atual: v#{VERSION})"
          instalar_rbz_local(pacote_local, silent: silent, &callback)
          return
        end

        # 2. Verifica online usando Sketchup::Http::Request (assíncrono nativo, zero travamento)
        base_url = Config.server_url.to_s.strip.chomp('/')
        if base_url.empty?
          finalizar_sem_atualizacao(silent, callback)
          return
        end

        url_check = base_url.include?('supabase.co') ? "#{base_url}/storage/v1/object/public/plugin/version.json" : "#{base_url}/api/plugin/latest?current=#{VERSION}&ts=#{Time.now.to_i}"

        if defined?(Sketchup::Http::Request)
          begin
            req = Sketchup::Http::Request.new(url_check, Sketchup::Http::GET)
            req.headers = {
              'User-Agent' => "SketchUp-PapaSysPlugin/#{VERSION}",
              'Accept' => 'application/json'
            }
            req.start do |_request, response|
              begin
                if response && response.status_code == 200
                  data = JSON.parse(response.body) rescue {}
                  remote_ver = data['version'].to_s.strip
                  download_url = data['download_url'].to_s.strip
                  changelog = data['changelog'] || 'Melhorias de desempenho e correções.'

                  has_update = !remote_ver.empty? && (Gem::Version.new(remote_ver) > Gem::Version.new(VERSION) rescue false)

                  if has_update && auto_install && !download_url.empty?
                    puts "[PapaSys Updater] Nova versão remota disponível: v#{remote_ver} (Atual: v#{VERSION})"
                    baixar_e_instalar_async(download_url, remote_ver, changelog, silent, callback)
                  else
                    puts "[PapaSys Updater] Plugin já está na versão mais recente (v#{VERSION})."
                    UI.messagebox("#{PLUGIN_NAME} já está na versão mais recente (v#{VERSION}).", MB_OK) unless silent
                    callback.call(false, VERSION, "Versão atual (v#{VERSION}) já é a mais recente.") if callback
                  end
                else
                  finalizar_sem_atualizacao(silent, callback)
                end
              rescue => e
                puts "[PapaSys Updater] Aviso ao processar resposta: #{e.message}"
                finalizar_sem_atualizacao(silent, callback)
              end
            end
          rescue => e
            puts "[PapaSys Updater] Erro ao iniciar requisição HTTP: #{e.message}"
            finalizar_sem_atualizacao(silent, callback)
          end
        else
          finalizar_sem_atualizacao(silent, callback)
        end
      rescue => e
        puts "[PapaSys Updater] Erro geral ao verificar atualizações: #{e.message}"
        callback.call(false, nil, e.message) if callback
      end

      def self.finalizar_sem_atualizacao(silent, callback)
        puts "[PapaSys Updater] Plugin já está atualizado (v#{VERSION})."
        UI.messagebox("#{PLUGIN_NAME} já está atualizado (v#{VERSION}).", MB_OK) unless silent
        callback.call(false, VERSION, "Plugin já está na versão mais recente (v#{VERSION}).") if callback
      end

      def self.baixar_e_instalar_async(url_str, version_str, changelog, silent, callback)
        return unless defined?(Sketchup::Http::Request)

        puts "[PapaSys Updater] Baixando atualização de: #{url_str}"
        req = Sketchup::Http::Request.new(url_str, Sketchup::Http::GET)
        req.headers = { 'User-Agent' => "SketchUp-PapaSysPlugin/#{VERSION}" }
        req.start do |_request, response|
          begin
            if response && response.status_code == 200 && response.body && response.body.bytesize > 100
              temp_dir = Sketchup.temp_dir rescue (ENV['TEMP'] || '/tmp')
              temp_file = File.join(temp_dir, "papasys_paginacao_v#{version_str}_#{Time.now.to_i}.rbz")
              File.open(temp_file, 'wb') { |io| io.write(response.body) }

              sucesso = Sketchup.install_from_archive(temp_file)
              File.delete(temp_file) rescue nil

              if sucesso
                recarregar_modulos
                UI.messagebox("O #{PLUGIN_NAME} foi atualizado para v#{version_str}!\n\nNovidades:\n#{changelog}", MB_OK) unless silent
                callback.call(true, version_str, changelog) if callback
              else
                UI.messagebox("Não foi possível instalar a atualização v#{version_str}.", MB_OK) unless silent
                callback.call(false, nil, "Falha na instalação") if callback
              end
            else
              UI.messagebox("Falha ao baixar pacote de atualização v#{version_str}.", MB_OK) unless silent
              callback.call(false, nil, "Falha no download") if callback
            end
          rescue => e
            puts "[PapaSys Updater] Erro no download assíncrono: #{e.message}"
            callback.call(false, nil, e.message) if callback
          end
        end
      end

      def self.start_auto_check
        return unless Config.auto_update?

        agora = Time.now.to_i
        ultimo = Config.last_check_time
        if (agora - ultimo) > 86400
          Config.last_check_time = agora
          UI.start_timer(8, false) do
            check(silent: true, auto_install: true)
          end
        end
      end
    end
  end
end
