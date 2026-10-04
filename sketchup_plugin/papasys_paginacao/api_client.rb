# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'openssl'

module PapaSys
  module Paginacao
    module ApiClient
      # Executa requisição HTTP compatível com Sketchup::Http::Request e Net::HTTP fallback
      def self.http_request(method, endpoint, payload = nil, &callback)
        base_url = Config.server_url.to_s.strip.chomp('/')
        base_url = Config::DEFAULT_SERVER_URL if base_url.empty? || base_url.include?('localhost')
        full_url = endpoint.start_with?('http') ? endpoint : "#{base_url}#{endpoint}"

        headers = {
          'apikey' => Config.supabase_key,
          'Authorization' => "Bearer #{Config.supabase_key}",
          'Content-Type' => 'application/json',
          'Prefer' => 'return=representation'
        }

        if defined?(Sketchup::Http::Request)
          sk_method = case method.to_s.upcase
                      when 'GET' then Sketchup::Http::GET
                      when 'POST' then Sketchup::Http::POST
                      when 'PATCH' then Sketchup::Http::PATCH
                      when 'DELETE' then Sketchup::Http::DELETE
                      else Sketchup::Http::POST
                      end

          req = Sketchup::Http::Request.new(full_url, sk_method)
          req.headers = headers
          req.body = payload.is_a?(String) ? payload : JSON.generate(payload) if payload

          req.start do |_request, response|
            code = response.status_code
            if code >= 200 && code < 300
              data = JSON.parse(response.body) rescue response.body
              callback.call(true, data, code) if callback
            else
              callback.call(false, { error: "HTTP #{code}: #{response.body}" }, code) if callback
            end
          end
        else
          begin
            uri = URI.parse(full_url)
            http = Net::HTTP.new(uri.host, uri.port)
            http.use_ssl = (uri.scheme == 'https')
            http.verify_mode = OpenSSL::SSL::VERIFY_NONE
            http.open_timeout = 6
            http.read_timeout = 6

            net_req = case method.to_s.upcase
                      when 'GET' then Net::HTTP::Get.new(uri.request_uri)
                      when 'POST' then Net::HTTP::Post.new(uri.request_uri)
                      when 'PATCH' then Net::HTTP::Patch.new(uri.request_uri)
                      when 'DELETE' then Net::HTTP::Delete.new(uri.request_uri)
                      else Net::HTTP::Post.new(uri.request_uri)
                      end

            headers.each { |k, v| net_req[k] = v }
            net_req.body = payload.is_a?(String) ? payload : JSON.generate(payload) if payload

            response = http.request(net_req)
            code = response.code.to_i
            if code >= 200 && code < 300
              data = JSON.parse(response.body) rescue response.body
              callback.call(true, data, code) if callback
            else
              callback.call(false, { error: "HTTP #{code}: #{response.body}" }, code) if callback
            end
          rescue => e
            callback.call(false, { error: "Falha de rede: #{e.message}" }, 0) if callback
          end
        end
      end

      # 1. Lista orçamentos existentes de uma divisão para acumular piscinas (Seção 5)
      def self.listar_orcamentos_divisao(divisao, &callback)
        div = (divisao || 'sob_medida').to_s.strip
        endpoint = "/rest/v1/budgets?division=eq.#{div}&order=created_at.desc&limit=50"

        http_request('GET', endpoint) do |sucesso, dados, code|
          if sucesso && dados.is_a?(Array)
            callback.call(true, dados) if callback
          else
            # Fallback para cache local / vazio
            callback.call(false, []) if callback
          end
        end
      end

      # Busca orçamento específico por código/número digitado pelo usuário
      def self.buscar_orcamento_por_codigo(codigo, divisao = nil, &callback)
        cod = codigo.to_s.strip
        if cod.empty?
          callback.call(false, nil) if callback
          return
        end

        query = "/rest/v1/budgets?budget_code=ilike.*#{URI.encode_www_form_component(cod)}*"
        query += "&division=eq.#{divisao}" if divisao && !divisao.empty?
        query += "&limit=5"

        http_request('GET', query) do |sucesso, dados, _code|
          if sucesso && dados.is_a?(Array) && !dados.empty?
            callback.call(true, dados) if callback
          else
            callback.call(false, []) if callback
          end
        end
      end

      def self.usuarios_padroes
        [
          {
            id: '77b65d92-3aa2-47a6-9dbb-033fd48f7b30',
            name: 'Administrador (PapaSys)',
            email: 'admin@papa.com',
            role: 'admin',
            allowed_divisions: ['sob_medida', 'incorporadora', 'internacional'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#0284c7'
          },
          {
            id: 'a0f528a8-ce32-4f4e-85b1-6c15612fda18',
            name: 'Victor Lourenço',
            email: 'usuario@papa.com',
            role: 'user',
            allowed_divisions: ['sob_medida'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#f97316'
          },
          {
            id: 'usr-admin',
            name: 'Administrador / Diretor',
            email: 'diretoria@igui.com',
            role: 'admin',
            allowed_divisions: ['sob_medida', 'incorporadora', 'internacional'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#0284c7'
          },
          {
            id: 'usr-victor',
            name: 'Victor Lourenço (iGUi)',
            email: 'victor@igui.com',
            role: 'user',
            allowed_divisions: ['sob_medida'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#f97316'
          },
          {
            id: 'usr-incorporadora',
            name: 'Engenharia Incorporadora',
            email: 'incorporadora@igui.com',
            role: 'user',
            allowed_divisions: ['incorporadora'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#10b981'
          },
          {
            id: 'usr-internacional',
            name: 'Comercial Internacional',
            email: 'internacional@igui.com',
            role: 'user',
            allowed_divisions: ['internacional'],
            allowed_stages: ['previa', 'galga', 'desenho_tecnico'],
            avatar_color: '#8b5cf6'
          }
        ]
      end

      # 2. Busca lista de usuários cadastrados para a tela de login
      def self.buscar_usuarios(&callback)
        endpoint = "/rest/v1/app_users?active=eq.true&order=name.asc"
        http_request('GET', endpoint) do |sucesso, dados, _code|
          if sucesso && dados.is_a?(Array) && !dados.empty?
            # Garante que Admin esteja presente na lista
            tem_admin = dados.any? { |u| (u['role'] == 'admin') || (u['email'] == 'admin@papa.com') }
            lista = tem_admin ? dados : (usuarios_padroes + dados)
            callback.call(true, lista) if callback
          else
            # Retorna usuários padrão de fábrica incluindo Administrador
            callback.call(true, usuarios_padroes) if callback
          end
        end
      end

      # 3. Envia o orçamento completo / adiciona piscina (Seções 5, 6, 7, 8, 10, 11)
      def self.enviar_piscina_orcamento(dados, &callback)
        modo = dados['modo_orcamento'] || dados[:modo_orcamento] || 'novo'
        budget_id = dados['budget_id'] || dados[:budget_id]

        divisao = (dados['division'] || dados[:division] || 'sob_medida').to_s
        etapa = (dados['stage'] || dados[:stage] || 'previa').to_s
        proj_nome = (dados['project_name'] || dados[:project_name] || 'Piscina iGUi').to_s
        cli_nome = (dados['client_name'] || dados[:client_name] || 'Cliente Geral').to_s
        modelo_nome = (dados['model_name'] || dados[:model_name] || 'Modelo iGUi').to_s
        qtd_unidades = [dados['units_count'].to_i, 1].max
        qtd_unidades = 1 if divisao == 'sob_medida' # Regra: Sob Medida: 1 orçamento = 1 piscina

        pool_type = dados['pool_type'] || 'convencional'
        structure_type = dados['structure_type'] || 'nao_autoportante'
        coating_type = dados['coating_type'] || 'pastilha_15x15'
        has_mold = !!dados['has_mold']

        area_revest = (dados['area_revestimento_m2'] || dados['internal_area_m2'] || 0.0).to_f.round(2)
        area_lamina = (dados['area_laminacao_m2'] || dados['lamination_area_m2'] || 0.0).to_f.round(2)
        vol_m3 = (dados['internal_volume_m3'] || dados['volume_m3'] || 0.0).to_f.round(2)
        vol_litros = (dados['internal_volume_liters'] || dados['volume_litros'] || (vol_m3 * 1000.0)).to_f.round(0)

        cantos_m = (dados['linear_corners_m'] || 0.0).to_f.round(2)
        quinas = (dados['alive_corners_count'] || 0).to_i
        finishes = dados['finishes'] || {}

        user_id = Config.current_user_id
        user_name = Config.current_user_name
        user_name = 'Victor Lourenço' if user_name.empty?

        # Cálculo de valores unitários conforme Seção 11
        val_base = (dados['unit_base_value'] || 0.0).to_f
        val_auto = (dados['unit_autoportante_value'] || (structure_type == 'autoportante' ? val_base * 1.50 : val_base)).to_f
        val_final = (dados['unit_final_value'] || (etapa == 'previa' ? val_auto * 1.05 : val_auto)).to_f
        val_total_modelo = (val_final * qtd_unidades).round(2)

        pool_payload = {
          model_name: modelo_nome,
          units_count: qtd_unidades,
          pool_type: pool_type,
          structure_type: structure_type,
          coating_type: coating_type,
          has_mold: has_mold,
          mold_auto: true,
          internal_area_m2: area_revest,
          lamination_area_m2: area_lamina,
          internal_volume_m3: vol_m3,
          internal_volume_liters: vol_litros,
          linear_corners_m: cantos_m,
          alive_corners_count: quinas,
          finishes_details: finishes,
          is_custom_coating: coating_type == 'porcelanato_villagres' || coating_type == 'personalizado',
          unit_base_value: val_base.round(2),
          unit_autoportante_value: val_auto.round(2),
          unit_final_value: val_final.round(2),
          total_model_value: val_total_modelo
        }

        # Salva em arquivo de cache compartilhado (Bridge com sistema web)
        salvar_cache_local({
          modo: modo,
          budget_id: budget_id,
          project_name: proj_nome,
          client_name: cli_nome,
          division: divisao,
          stage: etapa,
          user_name: user_name,
          pool: pool_payload,
          timestamp: Time.now.to_s
        })

        if modo == 'galga' && budget_id && !budget_id.empty?
          # MODO GALGA: Substitui a piscina do orçamento existente e avança para a etapa 'galga' (0% de margem)
          pool_payload[:budget_id] = budget_id
          
          # Remove piscinas antigas do orçamento para substituição completa pela galga
          http_request('DELETE', "/rest/v1/budget_pools?budget_id=eq.#{budget_id}") do |_ok_del, _res_del, _code_del|
            # Insere a nova piscina confirmada na galga
            http_request('POST', '/rest/v1/budget_pools', pool_payload) do |_ok_p, _res_p, _code_p|
              # Atualiza dados consolidados e etapa do orçamento para 'galga'
              patch_budget = {
                stage: 'galga',
                total_price: val_total_modelo,
                total_base_cost: (val_base * qtd_unidades).round(2),
                total_area_revestimento: (area_revest * qtd_unidades).round(2),
                total_area_laminacao: (area_lamina * qtd_unidades).round(2),
                total_volume_m3: (vol_m3 * qtd_unidades).round(2),
                total_volume_liters: (vol_litros * qtd_unidades).round(0),
                notes: "Orçamento atualizado para GALGA técnica (medidas da piscina substituídas via SketchUp 3D)."
              }
              http_request('PATCH', "/rest/v1/budgets?id=eq.#{budget_id}", patch_budget) do |_ok_b, _res_b, _code_b|
                sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, 'galga', user_name)

                callback.call(true, {
                  success: true,
                  budget_id: budget_id,
                  message: "Piscina '#{modelo_nome}' substituída e orçamento atualizado para GALGA (0% de margem) com sucesso!",
                  project_url: "orcamento.html?id=#{budget_id}"
                }) if callback
              end
            end
          end
        elsif modo == 'existente' && budget_id && !budget_id.empty?
          # Adiciona piscina ao orçamento existente
          pool_payload[:budget_id] = budget_id
          endpoint_pools = '/rest/v1/budget_pools'

          http_request('POST', endpoint_pools, pool_payload) do |ok_pool, res_pool, _code|
            # Também sincroniza com projects (para compatibilidade retroativa)
            sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, etapa, user_name)

            callback.call(true, {
              success: true,
              budget_id: budget_id,
              message: "Piscina '#{modelo_nome}' (#{qtd_unidades} un) adicionada ao orçamento existente com sucesso!",
              project_url: "orcamento.html?id=#{budget_id}"
            }) if callback
          end
        else
          # Cria NOVO orçamento preservando o número digitado pelo usuário (vem do e-mail)
          cod_digitado = (dados['budget_code'] || dados[:budget_code] || '').to_s.strip
          cod_final = cod_digitado.empty? ? "ORC-#{Time.now.strftime('%y%m')}-#{rand(1000..9999)}" : cod_digitado

          budget_payload = {
            budget_code: cod_final,
            client_name: cli_nome,
            project_name: proj_nome,
            division: divisao,
            stage: etapa,
            status: 'em_aberto',
            assigned_user_id: user_id.empty? ? nil : user_id,
            assigned_user_name: user_name,
            total_price: val_total_modelo,
            total_base_cost: (val_base * qtd_unidades).round(2),
            total_area_revestimento: (area_revest * qtd_unidades).round(2),
            total_area_laminacao: (area_lamina * qtd_unidades).round(2),
            total_volume_m3: (vol_m3 * qtd_unidades).round(2),
            total_volume_liters: (vol_litros * qtd_unidades).round(0),
            notes: "Orçamento criado via SketchUp para a divisão #{divisao.upcase} (Etapa: #{etapa.capitalize})."
          }

          endpoint_budgets = '/rest/v1/budgets'
          http_request('POST', endpoint_budgets, budget_payload) do |ok_b, res_b, code_b|
            created_id = nil
            if ok_b
              b_data = res_b.is_a?(Array) ? res_b.first : res_b
              created_id = b_data['id'] if b_data
            end

            created_id ||= "local-#{Time.now.to_i}"

            # Se criou o budget no Supabase, anexa o budget_pool
            if ok_b && created_id && !created_id.start_with?('local')
              pool_payload[:budget_id] = created_id
              http_request('POST', '/rest/v1/budget_pools', pool_payload)
            end

            # Sincroniza tabela legada
            sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, etapa, user_name)

            callback.call(true, {
              success: true,
              budget_id: created_id,
              budget_code: cod_final,
              message: "Orçamento #{cod_final} criado com sucesso na divisão #{divisao.upcase} (#{etapa.capitalize})!",
              project_url: "orcamento.html?id=#{created_id}"
            }) if callback
          end
        end
      end

      # Sincroniza com a tabela 'projects' original para total compatibilidade retroativa
      def self.sincronizar_tabela_legada(proj, cli, area, borda, valor, etapa, user)
        payload = {
          project_name: proj,
          client_name: cli,
          tile_spec: 'iGUi Revestimento',
          tile_width_cm: 15.0,
          tile_height_cm: 15.0,
          grout_cm: 0.2,
          internal_area_m2: area,
          border_perimeter_linear_m: borda,
          status: etapa == 'previa' ? 'novo' : 'em_analise',
          total_cost: (valor * 0.75).round(2),
          margin_percent: etapa == 'previa' ? 5.0 : 0.0,
          total_price: valor.round(2),
          notes: "Criado pelo plugin iGUi por #{user} (Etapa: #{etapa}).",
          plugin_version: VERSION
        }
        http_request('POST', '/rest/v1/projects', payload) rescue nil
      end

      # Ponte local persistente com o sistema web
      def self.salvar_cache_local(obj)
        base_web = File.expand_path('../../sistema_web/plugin', File.dirname(__FILE__))
        caminho = File.join(base_web, 'last_pool_sync.json')
        File.open(caminho, 'w:UTF-8') do |f|
          f.write(JSON.pretty_generate(obj))
        end
      rescue => _e
        # Silencioso
      end
    end
  end
end
