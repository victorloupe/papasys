# encoding: UTF-8
require 'net/http'
require 'uri'
require 'json'
require 'openssl'
require 'fileutils'

module PapaSys
  module Paginacao
    module ApiClient
      # Helper: Gera UUID v4 único no plugin (Seção 14.1)
      def self.gerar_uuid
        begin
          require 'securerandom'
          return SecureRandom.uuid
        rescue => _e
          sprintf('%08x-%04x-4%03x-%04x-%012x',
            rand(0..0xffffffff),
            rand(0..0xffff),
            rand(0..0x0fff),
            rand(0x8000..0xbfff),
            rand(0..0xffffffffffff)
          )
        end
      end

      # Local da fila offline e logs de erros (Seção 14.1)
      def self.caminho_fila_local
        base_dir = File.expand_path('../../sistema_web/plugin', File.dirname(__FILE__))
        FileUtils.mkdir_p(base_dir) rescue nil
        File.join(base_dir, 'plugin_offline_queue.json')
      end

      def self.caminho_log_erros
        base_dir = File.expand_path('../../sistema_web/plugin', File.dirname(__FILE__))
        FileUtils.mkdir_p(base_dir) rescue nil
        File.join(base_dir, 'sync_errors.log')
      end

      def self.registrar_log_erro(contexto, status_code, mensagem)
        linha = "[#{Time.now.strftime('%Y-%m-%d %H:%M:%S')}] [Status #{status_code}] #{contexto}: #{mensagem}\n"
        puts "[PapaSys Sync Error] #{linha}"
        File.open(caminho_log_erros, 'a:UTF-8') do |f|
          f.write(linha)
        end
      rescue => _e
      end

      def self.fila_local_ler
        path = caminho_fila_local
        return [] unless File.exist?(path)
        begin
          content = File.read(path, encoding: 'UTF-8')
          data = JSON.parse(content)
          data.is_a?(Array) ? data : []
        rescue => _e
          []
        end
      end

      def self.fila_local_salvar(itens)
        path = caminho_fila_local
        File.open(path, 'w:UTF-8') do |f|
          f.write(JSON.pretty_generate(itens))
        end
      rescue => _e
      end

      def self.fila_local_adicionar(item)
        itens = fila_local_ler
        item_id = item['id'] || item[:id]
        itens.reject! { |i| (i['id'] || i[:id]) == item_id }
        itens << item
        fila_local_salvar(itens)
        itens.size
      end

      def self.fila_local_remover(id)
        itens = fila_local_ler
        itens.reject! { |i| (i['id'] || i[:id]) == id }
        fila_local_salvar(itens)
        itens.size
      end

      def self.fila_local_contar
        fila_local_ler.size
      end

      # Executa requisição HTTP compatível com Sketchup::Http::Request e Net::HTTP fallback
      # Respeita proxies corporativos da empresa (ENV['http_proxy'] / ENV['https_proxy']) - Seção 14.1
      def self.http_request(method, endpoint, payload = nil, retry_count = 0, &callback)
        base_url = Config.server_url.to_s.strip.chomp('/')
        base_url = Config::DEFAULT_SERVER_URL if base_url.empty? || base_url.include?('localhost')
        full_url = endpoint.start_with?('http') ? endpoint : "#{base_url}#{endpoint}"

        bearer = Config.access_token.to_s.strip
        bearer = Config.supabase_key if bearer.empty?

        headers = {
          'apikey' => Config.supabase_key,
          'Authorization' => "Bearer #{bearer}",
          'Content-Type' => 'application/json',
          'Prefer' => 'resolution=merge-duplicates,return=representation'
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
            if code == 401 && retry_count == 0 && !Config.refresh_token.empty?
              # Token expirou durante requisição - tenta renovar e retenta
              renovar_token do |ok_renova, _novo_tok|
                if ok_renova
                  http_request(method, endpoint, payload, retry_count + 1, &callback)
                else
                  callback.call(false, { error: "HTTP 401: Sessão expirada" }, 401) if callback
                end
              end
            elsif code >= 200 && code < 300
              data = JSON.parse(response.body) rescue response.body
              callback.call(true, data, code) if callback
            else
              callback.call(false, { error: "HTTP #{code}: #{response.body}" }, code) if callback
            end
          end
        else
          begin
            uri = URI.parse(full_url)
            
            # Respeitar configurações de proxy do SO / ambiente da empresa (Seção 14.1)
            proxy_url = ENV['https_proxy'] || ENV['http_proxy'] || ENV['HTTPS_PROXY'] || ENV['HTTP_PROXY']
            if proxy_url && !proxy_url.to_s.strip.empty?
              p_uri = URI.parse(proxy_url)
              http = Net::HTTP.new(uri.host, uri.port, p_uri.host, p_uri.port, p_uri.user, p_uri.password)
            else
              http = Net::HTTP.new(uri.host, uri.port)
            end

            http.use_ssl = (uri.scheme == 'https')
            http.verify_mode = OpenSSL::SSL::VERIFY_NONE
            http.open_timeout = 8
            http.read_timeout = 8

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

            if code == 401 && retry_count == 0 && !Config.refresh_token.empty?
              renovar_token do |ok_renova, _novo_tok|
                if ok_renova
                  http_request(method, endpoint, payload, retry_count + 1, &callback)
                else
                  callback.call(false, { error: "HTTP 401: Sessão expirada" }, 401) if callback
                end
              end
            elsif code >= 200 && code < 300
              data = JSON.parse(response.body) rescue response.body
              callback.call(true, data, code) if callback
            else
              callback.call(false, { error: "HTTP #{code}: #{response.body}" }, code) if callback
            end
          rescue => e
            callback.call(false, { error: "Falha de rede / proxy: #{e.message}" }, 0) if callback
          end
        end
      end

      # Verifica se o token expirou e renova automaticamente com o refresh_token (Seção 14.1)
      def self.garantir_token_valido(&bloco)
        ref_tok = Config.refresh_token.to_s.strip
        expira_em = Config.token_expires_at.to_i

        if !ref_tok.empty? && (expira_em > 0 && Time.now.to_i >= (expira_em - 120))
          puts "[PapaSys Sync] Token próximo do vencimento (#{expira_em}). Renovando automaticamente com refresh_token..."
          renovar_token do |ok_renova, _novo_tok|
            bloco.call(ok_renova) if bloco
          end
        else
          bloco.call(true) if bloco
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

      # Autenticação Supabase via API REST com E-mail e Senha (Seção 12.6)
      def self.login_supabase(email, password, &callback)
        clean_email = email.to_s.strip.downcase
        endpoint = '/auth/v1/token?grant_type=password'
        payload = { email: clean_email, password: password.to_s }

        http_request('POST', endpoint, payload) do |sucesso, dados, code|
          if sucesso && dados.is_a?(Hash) && dados['access_token']
            Config.access_token = dados['access_token']
            Config.refresh_token = dados['refresh_token'] || ''
            exp_in = (dados['expires_in'] || 3600).to_i
            Config.token_expires_at = Time.now.to_i + exp_in

            user_obj = dados['user'] || {}
            Config.current_user_id = user_obj['id'] || ''
            Config.current_user_email = user_obj['email'] || clean_email

            buscar_perfil_usuario(Config.current_user_id) do |_ok_prof, prof|
              if prof
                Config.current_user_name = prof['name'] || user_obj.dig('user_metadata', 'name') || clean_email.split('@').first
                Config.current_user_role = prof['role'] || 'user'
                divs = prof['allowed_divisions'] || ['sob_medida']
                divs = ['sob_medida', 'incorporadora', 'internacional'] if Config.current_user_role == 'admin'
                Config.allowed_divisions = divs
                unless divs.include?(Config.selected_division)
                  Config.selected_division = divs.first || 'sob_medida'
                end
              end

              callback.call(true, {
                id: Config.current_user_id,
                name: Config.current_user_name,
                email: Config.current_user_email,
                role: Config.current_user_role,
                allowed_divisions: Config.allowed_divisions,
                selected_division: Config.selected_division
              }) if callback
            end
          else
            err_msg = dados.is_a?(Hash) ? (dados['error_description'] || dados['msg'] || dados['error'] || "HTTP #{code}") : "Credenciais inválidas."
            registrar_log_erro("login_supabase (#{clean_email})", code, err_msg)
            callback.call(false, { error: err_msg }, code) if callback
          end
        end
      end

      # Renova token de sessão via refresh_token (Seção 12.6 & 14.1)
      def self.renovar_token(&callback)
        ref_tok = Config.refresh_token.to_s.strip
        if ref_tok.empty?
          callback.call(false, nil) if callback
          return
        end

        endpoint = '/auth/v1/token?grant_type=refresh_token'
        payload = { refresh_token: ref_tok }

        http_request('POST', endpoint, payload) do |sucesso, dados, code|
          if sucesso && dados.is_a?(Hash) && dados['access_token']
            Config.access_token = dados['access_token']
            Config.refresh_token = dados['refresh_token'] if dados['refresh_token']
            exp_in = (dados['expires_in'] || 3600).to_i
            Config.token_expires_at = Time.now.to_i + exp_in
            puts "[PapaSys Sync] Token renovado com sucesso! Válido por #{exp_in}s."
            callback.call(true, dados['access_token']) if callback
          else
            err = dados.is_a?(Hash) ? (dados['error_description'] || dados['msg'] || "HTTP #{code}") : "Falha na renovação"
            registrar_log_erro("renovar_token", code, err)
            callback.call(false, nil) if callback
          end
        end
      end

      def self.buscar_perfil_usuario(user_id, &callback)
        endpoint = "/rest/v1/app_users?id=eq.#{user_id}&select=*"
        http_request('GET', endpoint) do |sucesso, dados, _code|
          if sucesso && dados.is_a?(Array) && !dados.empty?
            callback.call(true, dados.first) if callback
          else
            callback.call(false, nil) if callback
          end
        end
      end

      # 2. Busca lista de usuários cadastrados para a tela de login
      def self.buscar_usuarios(&callback)
        endpoint = "/rest/v1/app_users?active=eq.true&order=name.asc"
        http_request('GET', endpoint) do |sucesso, dados, _code|
          if sucesso && dados.is_a?(Array) && !dados.empty?
            tem_admin = dados.any? { |u| (u['role'] == 'admin') || (u['email'] == 'admin@papa.com') }
            lista = tem_admin ? dados : (usuarios_padroes + dados)
            callback.call(true, lista) if callback
          else
            callback.call(true, usuarios_padroes) if callback
          end
        end
      end

      # 3. Envia o orçamento completo / adiciona piscina (Seções 14.1 e 14.4)
      def self.enviar_piscina_orcamento(dados, &callback)
        garantir_token_valido do |_ok_tok|
          executar_envio_piscina(dados, &callback)
        end
      end

      def self.executar_envio_piscina(dados, &callback)
        modo = dados['modo_orcamento'] || dados[:modo_orcamento] || 'novo'
        budget_id = dados['budget_id'] || dados[:budget_id]

        divisao = (dados['division'] || dados[:division] || 'sob_medida').to_s
        etapa = (dados['stage'] || dados[:stage] || 'previa').to_s
        proj_nome = (dados['project_name'] || dados[:project_name] || 'Piscina iGUi').to_s
        cli_nome = (dados['client_name'] || dados[:client_name] || 'Cliente Geral').to_s
        modelo_nome = (dados['model_name'] || dados[:model_name] || 'Modelo iGUi').to_s
        
        # 14.4 Quantidade no Sob Medida: padrão 1, mas editável! (Substitui regra anterior)
        qtd_unidades = [dados['units_count'].to_i, 1].max

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

        # UUIDs gerados no cliente para evitar duplicidade em reenvios (Seção 14.1)
        pool_uuid = dados['pool_id'] || dados[:pool_id] || gerar_uuid
        client_budget_uuid = (budget_id && !budget_id.to_s.empty?) ? budget_id.to_s : (dados['id'] || dados[:id] || gerar_uuid)

        pool_payload = {
          id: pool_uuid,
          budget_id: client_budget_uuid,
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
          budget_id: client_budget_uuid,
          project_name: proj_nome,
          client_name: cli_nome,
          division: divisao,
          stage: etapa,
          user_name: user_name,
          pool: pool_payload,
          timestamp: Time.now.to_s
        })

        tratar_falha = lambda do |erro_msg, http_code|
          item_fila = {
            'id' => client_budget_uuid,
            'dados' => dados,
            'tentativas' => 1,
            'ultimo_erro' => erro_msg,
            'timestamp' => Time.now.strftime('%Y-%m-%d %H:%M:%S'),
            'status' => 'pendente'
          }
          fila_local_adicionar(item_fila)
          registrar_log_erro("enviar_piscina_orcamento (#{divisao})", http_code, erro_msg)

          callback.call(false, {
            error: erro_msg,
            pendente: true,
            queue_count: fila_local_contar,
            budget_id: client_budget_uuid,
            message: "Falha de rede/proxy. Salvo na fila local para reenvio automático: #{erro_msg}"
          }, http_code) if callback
        end

        if modo == 'galga' && budget_id && !budget_id.empty?
          pool_payload[:budget_id] = budget_id

          http_request('DELETE', "/rest/v1/budget_pools?budget_id=eq.#{budget_id}") do |_ok_del, _res_del, _code_del|
            http_request('POST', '/rest/v1/budget_pools', pool_payload) do |ok_p, res_p, code_p|
              if !ok_p
                tratar_falha.call(res_p[:error] || "Erro ao salvar piscina da galga", code_p)
                next
              end

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
              http_request('PATCH', "/rest/v1/budgets?id=eq.#{budget_id}", patch_budget) do |ok_b, res_b, code_b|
                if ok_b
                  fila_local_remover(budget_id)
                  sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, 'galga', user_name)
                  callback.call(true, {
                    success: true,
                    budget_id: budget_id,
                    queue_count: fila_local_contar,
                    message: "Piscina '#{modelo_nome}' substituída e orçamento atualizado para GALGA (0% margem) com sucesso!",
                    project_url: "orcamento.html?id=#{budget_id}"
                  }) if callback
                else
                  tratar_falha.call(res_b[:error] || "Erro ao atualizar cabeçalho do orçamento na galga", code_b)
                end
              end
            end
          end

        elsif modo == 'existente' && budget_id && !budget_id.empty?
          pool_payload[:budget_id] = budget_id
          endpoint_pools = '/rest/v1/budget_pools'

          http_request('POST', endpoint_pools, pool_payload) do |ok_pool, res_pool, code_pool|
            if ok_pool
              fila_local_remover(budget_id)
              sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, etapa, user_name)
              callback.call(true, {
                success: true,
                budget_id: budget_id,
                queue_count: fila_local_contar,
                message: "Piscina '#{modelo_nome}' (#{qtd_unidades} un) adicionada ao orçamento existente com sucesso!",
                project_url: "orcamento.html?id=#{budget_id}"
              }) if callback
            else
              tratar_falha.call(res_pool[:error] || "Erro ao adicionar piscina ao orçamento existente", code_pool)
            end
          end

        else
          # Cria NOVO orçamento com UUID gerado no plugin para idempotência e sem duplicação
          cod_digitado = (dados['budget_code'] || dados[:budget_code] || '').to_s.strip
          cod_final = cod_digitado.empty? ? "ORC-#{Time.now.strftime('%y%m')}-#{rand(1000..9999)}" : cod_digitado

          budget_payload = {
            id: client_budget_uuid,
            budget_code: cod_final,
            client_name: cli_nome,
            project_name: proj_nome,
            division: divisao,
            stage: etapa,
            status: 'em_aberto',
            created_by: user_id.empty? ? nil : user_id,
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
            if ok_b
              pool_payload[:budget_id] = client_budget_uuid
              http_request('POST', '/rest/v1/budget_pools', pool_payload) do |ok_p, res_p, code_p|
                if ok_p
                  fila_local_remover(client_budget_uuid)
                  sincronizar_tabela_legada(proj_nome, cli_nome, area_revest, cantos_m, val_total_modelo, etapa, user_name)

                  callback.call(true, {
                    success: true,
                    budget_id: client_budget_uuid,
                    budget_code: cod_final,
                    queue_count: fila_local_contar,
                    message: "Orçamento #{cod_final} criado com sucesso na divisão #{divisao.upcase} (#{etapa.capitalize})!",
                    project_url: "orcamento.html?id=#{client_budget_uuid}"
                  }) if callback
                else
                  tratar_falha.call(res_p[:error] || "Orçamento criado, mas falha ao salvar piscina", code_p)
                end
              end
            else
              tratar_falha.call(res_b[:error] || "Falha ao registrar novo orçamento", code_b)
            end
          end
        end
      end

      # Reenvio em lote de todos os orçamentos pendentes na fila local (Seção 14.1)
      def self.reenviar_pendentes(&callback)
        pendentes = fila_local_ler
        if pendentes.empty?
          callback.call(true, { message: "Nenhum orçamento pendente na fila.", reenviados: 0, falhas: 0, restantes: 0 }) if callback
          return
        end

        total_itens = pendentes.size
        reenviados = 0
        falhas = 0

        processar_item = lambda do |lista|
          if lista.empty?
            restantes = fila_local_contar
            callback.call(true, {
              success: true,
              message: "Processamento concluído: #{reenviados} reenviado(s) com sucesso. Pendentes: #{restantes}.",
              reenviados: reenviados,
              falhas: falhas,
              restantes: restantes
            }) if callback
            return
          end

          item = lista.shift
          dados_item = item['dados'] || item
          executar_envio_piscina(dados_item) do |sucesso, _resp, _code|
            if sucesso
              reenviados += 1
            else
              falhas += 1
            end
            processar_item.call(lista)
          end
        end

        processar_item.call(pendentes.dup)
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
      end
    end
  end
end
