# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'openssl'

module PapaSys
  module Paginacao
    module ApiClient
      # Envia os dados geométricos e quantitativos diretamente para o Supabase (ou Webhook customizado)
      def self.enviar_projeto(dados_projeto, &callback)
        base_url = Config.server_url.to_s.strip.chomp('/')
        base_url = Config::DEFAULT_SERVER_URL if base_url.empty? || base_url.include?('localhost')
        
        is_supabase = base_url.include?('supabase.co')

        area_m2 = (dados_projeto[:area_interna_m2] || dados_projeto['internal_area_m2'] || 0).to_f
        borda_m = (dados_projeto[:borda_perimetro_linear_m] || dados_projeto['border_perimeter_linear_m'] || 0).to_f

        # Estimativa preliminar automática
        custo_direto = (area_m2 * 230.0 + borda_m * 175.0).round(2)
        preco_sugerido = (custo_direto * 1.25).round(2)

        proj_nome = dados_projeto[:projeto] || dados_projeto['project_name'] || 'Piscina Nova'
        cli_nome = dados_projeto[:cliente] || dados_projeto['client_name'] || 'Cliente Geral'
        larg_peca = (dados_projeto[:largura_peca_cm] || dados_projeto['tile_width_cm'] || 15.0).to_f
        alt_peca = (dados_projeto[:altura_peca_cm] || dados_projeto['tile_height_cm'] || 15.0).to_f
        rejunte = (dados_projeto[:rejunte_cm] || dados_projeto['grout_cm'] || 0.2).to_f

        dim = dados_projeto[:dimensoes] || {}

        puts "\n[PapaSys] === ENVIANDO PROJETO PARA A NUVEM ==="
        puts "[PapaSys] Destino: #{base_url}"
        puts "[PapaSys] Projeto: #{proj_nome} | Área: #{area_m2} m² | Borda: #{borda_m} m"

        if is_supabase
          payload = {
            project_name: proj_nome,
            client_name: cli_nome,
            tile_spec: "#{larg_peca}x#{alt_peca}",
            tile_width_cm: larg_peca,
            tile_height_cm: alt_peca,
            grout_cm: rejunte,
            internal_area_m2: area_m2,
            border_perimeter_linear_m: borda_m,
            pool_length_m: (dim[:comprimento_m] || dados_projeto['pool_length_m'] || 0).to_f,
            pool_width_m: (dim[:largura_m] || dados_projeto['pool_width_m'] || 0).to_f,
            pool_depth_m: (dim[:profundidade_m] || dados_projeto['pool_depth_m'] || 0).to_f,
            status: 'novo',
            total_cost: custo_direto,
            margin_percent: 25.0,
            total_price: preco_sugerido,
            notes: dados_projeto[:notas] || dados_projeto['notes'] || 'Paginação modular centralizada sem recortes gerada no SketchUp.',
            plugin_version: VERSION
          }

          endpoint = "#{base_url}/rest/v1/projects"

          # 1. Método preferido no SketchUp: Sketchup::Http::Request (nativo, thread-safe, não trava a UI)
          if defined?(Sketchup::Http::Request)
            req = Sketchup::Http::Request.new(endpoint, Sketchup::Http::POST)
            req.headers = {
              'apikey' => Config.supabase_key,
              'Authorization' => "Bearer #{Config.supabase_key}",
              'Content-Type' => 'application/json',
              'Prefer' => 'return=representation'
            }
            req.body = JSON.generate(payload)

            req.start do |_request, response|
              if response.status_code >= 200 && response.status_code < 300
                res_data = JSON.parse(response.body) rescue []
                created = res_data.is_a?(Array) ? res_data.first : res_data
                proj_id = created ? (created['id'] || created[:id]) : nil

                puts "[PapaSys] SUCESSO! Projeto gravado no banco de dados com ID: #{proj_id}"
                callback.call(true, {
                  message: 'Projeto sincronizado com sucesso com o PapaSys!',
                  project_id: proj_id,
                  project_url: proj_id ? "orcamento.html?id=#{proj_id}" : "index.html"
                }) if callback
              else
                puts "[PapaSys] ERRO HTTP #{response.status_code}: #{response.body}"
                callback.call(false, {
                  error: "Servidor retornou código HTTP #{response.status_code}: #{response.body}"
                }) if callback
              end
            end
          else
            # 2. Fallback com Net::HTTP síncrono rápido (sem timer preso)
            begin
              uri = URI.parse(endpoint)
              http = Net::HTTP.new(uri.host, uri.port)
              http.use_ssl = true
              http.verify_mode = OpenSSL::SSL::VERIFY_NONE
              http.open_timeout = 6
              http.read_timeout = 6

              net_req = Net::HTTP::Post.new(uri.request_uri)
              net_req['apikey'] = Config.supabase_key
              net_req['Authorization'] = "Bearer #{Config.supabase_key}"
              net_req['Content-Type'] = 'application/json'
              net_req['Prefer'] = 'return=representation'
              net_req.body = JSON.generate(payload)

              response = http.request(net_req)

              if response.code.to_i >= 200 && response.code.to_i < 300
                res_data = JSON.parse(response.body) rescue []
                created = res_data.is_a?(Array) ? res_data.first : res_data
                proj_id = created ? (created['id'] || created[:id]) : nil

                puts "[PapaSys] SUCESSO! Projeto gravado no banco de dados com ID: #{proj_id}"
                callback.call(true, {
                  message: 'Projeto sincronizado com sucesso com o PapaSys!',
                  project_id: proj_id,
                  project_url: proj_id ? "orcamento.html?id=#{proj_id}" : "index.html"
                }) if callback
              else
                puts "[PapaSys] ERRO HTTP #{response.code}: #{response.body}"
                callback.call(false, {
                  error: "Servidor retornou código HTTP #{response.code}"
                }) if callback
              end
            rescue => e
              puts "[PapaSys] ERRO CRÍTICO DE CONEXÃO: #{e.message}"
              callback.call(false, {
                error: "Falha de conexão com a nuvem: #{e.message}"
              }) if callback
            end
          end
        end
      end
    end
  end
end
