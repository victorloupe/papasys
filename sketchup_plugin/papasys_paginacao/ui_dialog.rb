# encoding: UTF-8
module PapaSys
  module Paginacao
    module UiDialog
      @dialog ||= nil
      @ultimo_resultado ||= nil
      @observer ||= nil

      class SelectionObserver < Sketchup::SelectionObserver
        def initialize(dialog)
          @dialog = dialog
          @pending = false
        end

        def onSelectionBulkChange(_selection)
          agendar_notificacao
        end

        def onSelectionCleared(_selection)
          agendar_notificacao
        end

        private

        def agendar_notificacao
          return if @pending
          @pending = true
          UI.start_timer(0.1, false) do
            @pending = false
            notificar
          end
        end

        def notificar
          return unless @dialog && @dialog.visible?
          info = UiDialog.obter_info_selecao
          @dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
        rescue => _e
          # Silencioso se o diálogo já fechou
        end
      end

      # Detecção ultrarrápida de curvas com limite de segurança (evita travar em blocos 3D pesados)
      def self.detectar_curvas_rapido(entidade, visitados = {}, contador = [0], limite = 1500)
        return false if contador[0] >= limite
        ents = entidade.is_a?(Sketchup::Group) ? entidade.entities : (entidade.respond_to?(:definition) ? entidade.definition.entities : nil)
        return false unless ents

        return false if visitados[ents.object_id]
        visitados[ents.object_id] = true

        ents.each do |e|
          next unless e.valid?
          if e.is_a?(Sketchup::Edge)
            contador[0] += 1
            return true if e.curve != nil || e.smooth? || e.soft?
            return false if contador[0] >= limite
          end
        end

        ents.each do |e|
          next unless e.valid?
          if e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
            return true if detectar_curvas_rapido(e, visitados, contador, limite)
            return false if contador[0] >= limite
          end
        end

        false
      rescue => _e
        false
      end

      def self.obter_info_selecao
        modelo = Sketchup.active_model
        return { has_selection: false, message: 'Nenhum modelo aberto' } unless modelo

        selecao = modelo.selection
        tem_contexto_aberto = (modelo.active_path && !modelo.active_path.empty?) rescue false

        if selecao.empty? && !tem_contexto_aberto
          return { has_selection: false, message: 'Nenhuma piscina selecionada no SketchUp' }
        end

        faces = []
        grupos = []
        selecao.each do |ent|
          next unless ent.valid?
          if ent.is_a?(Sketchup::Face)
            faces << ent
          elsif ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
            grupos << ent
          end
        end

        bb = Geom::BoundingBox.new
        nome_sugerido = ''
        if tem_contexto_aberto
          grp_aberto = modelo.active_path.first rescue nil
          if grp_aberto
            n_ab = grp_aberto.name.to_s.strip rescue ''
            n_ab = grp_aberto.definition.name.to_s.strip if n_ab.empty? && grp_aberto.respond_to?(:definition) rescue ''
            nome_sugerido = n_ab unless n_ab.empty?
          end
        end

        if !faces.empty?
          faces_para_bb = faces
          mats_sel = faces.flat_map { |f| [f.material, f.back_material] }.compact
          mat_u = mats_sel.find { |m| m.texture != nil } || mats_sel.first
          f_u = faces.first
          if mat_u
            pool_faces = if tem_contexto_aberto
                           modelo.active_entities.grep(Sketchup::Face).select { |f| f.valid? }
                         else
                           (f_u.all_connected rescue []).grep(Sketchup::Face).select { |f| f.valid? }
                         end
            mesmo_mat = pool_faces.select do |f|
              [f.material, f.back_material].compact.any? { |m| m == mat_u || m.name == mat_u.name }
            end
            faces_para_bb = mesmo_mat if mesmo_mat.length > faces.length
          end
          faces_para_bb.first(500).each { |f| bb.add(f.bounds) if f.valid? }
          tipo = 'faces'
          desc = faces_para_bb.length > faces.length ? "Revestimento (#{faces_para_bb.length} faces)" : "#{faces.length} faces selecionadas"
        elsif !grupos.empty?
          grupos.first(50).each do |g|
            bb.add(g.bounds) if g.valid?
            if nome_sugerido.empty?
              nome = g.name.to_s.strip
              nome = g.definition.name.to_s.strip if nome.empty? && g.respond_to?(:definition)
              nome_sugerido = nome unless nome.empty?
            end
          end
          tipo = 'grupo'
          desc = grupos.length == 1 ? 'Piscina 3D Selecionada' : "#{grupos.length} grupos selecionados"
        elsif tem_contexto_aberto
          grp_aberto = modelo.active_path.last rescue nil
          if grp_aberto && grp_aberto.respond_to?(:bounds)
            bb.add(grp_aberto.bounds)
          else
            modelo.active_entities.first(300).each { |e| bb.add(e.bounds) if e.valid? && e.respond_to?(:bounds) }
          end
          tipo = 'grupo'
          desc = 'Grupo da Piscina Aberto'
        else
          selecao.first(200).each { |e| bb.add(e.bounds) if e.valid? && e.respond_to?(:bounds) }
          tipo = 'elementos'
          desc = "#{selecao.length} elementos selecionados"
        end

        # Conversão precisa de polegadas para metros
        w_m = (bb.width.to_f * 0.0254).round(2)
        h_m = (bb.height.to_f * 0.0254).round(2)
        d_m = (bb.depth.to_f * 0.0254).round(2)

        comp = [w_m, h_m].max
        larg = [w_m, h_m].min
        prof = d_m

        # Detecta curvas/arcos com limite de segurança para não bloquear a UI
        tem_curvas = false
        if !grupos.empty?
          tem_curvas = detectar_curvas_rapido(grupos.first)
        elsif tem_contexto_aberto
          grp_ab = modelo.active_path.last rescue nil
          tem_curvas = grp_ab ? detectar_curvas_rapido(grp_ab) : false
        elsif !faces.empty?
          tem_curvas = faces.first(300).any? { |f| f.edges.any? { |e| e.curve != nil || e.smooth? } }
        end

        desc_final = desc
        if tem_curvas && (grupos.length == 1 || tem_contexto_aberto)
          desc_final = "Piscina Mista (Retas + Curva)"
        end

        return {
          has_selection: true,
          tipo: tipo,
          descricao: desc_final,
          nome_sugerido: nome_sugerido,
          comprimento_m: comp,
          largura_m: larg,
          profundidade_m: prof,
          count: selecao.length,
          tem_curvas: tem_curvas
        }
      rescue => e
        puts "[PapaSys] Erro ao obter seleção: #{e.message}"
        { has_selection: false, error: e.message }
      end

      def self.close
        if @observer && Sketchup.active_model
          Sketchup.active_model.selection.remove_observer(@observer) rescue nil
          @observer = nil
        end
        if @dialog
          @dialog.close rescue nil
          @dialog = nil
        end
      end

      def self.reload_window!
        close
        show
      end

      def self.show
        if @dialog && @dialog.visible?
          @dialog.bring_to_front
          return
        end

        html_file = File.join(File.dirname(__FILE__), 'html', 'dialog.html')
        unless File.exist?(html_file)
          UI.messagebox("Arquivo HTML de interface não encontrado: #{html_file}")
          return
        end

        options = {
          dialog_title: "iGUi Orçamentos 3D v#{VERSION}",
          preferences_key: 'iGUiOrcamentosDialog',
          scrollable: true,
          resizable: true,
          width: 470,
          height: 700,
          min_width: 420,
          min_height: 580
        }

        @dialog = UI::HtmlDialog.new(options)
        @dialog.set_file(html_file)

        @dialog.set_on_closed do
          if @observer && Sketchup.active_model
            Sketchup.active_model.selection.remove_observer(@observer) rescue nil
            @observer = nil
          end
        end

        if Sketchup.active_model
          if @observer
            Sketchup.active_model.selection.remove_observer(@observer) rescue nil
          end
          @observer = SelectionObserver.new(@dialog)
          Sketchup.active_model.selection.add_observer(@observer) rescue nil
        end

        registrar_callbacks(@dialog)

        @dialog.show
      end

      def self.registrar_callbacks(dialog)
        dialog.add_action_callback('ready') do |_action_context|
          user_id = Config.current_user_id
          user_name = Config.current_user_name
          user_email = Config.current_user_email
          user_role = Config.current_user_role
          allowed_divisions = Config.allowed_divisions
          selected_division = Config.selected_division

          # Usuário padrão caso não haja sessão gravada
          if user_name.empty?
            user_id = 'usr-victor'
            user_name = 'Victor Lourenço'
            user_email = 'victor@igui.com'
            user_role = 'user'
            allowed_divisions = ['sob_medida']
            selected_division = 'sob_medida'
            Config.current_user_id = user_id
            Config.current_user_name = user_name
            Config.current_user_email = user_email
            Config.current_user_role = user_role
            Config.allowed_divisions = allowed_divisions
            Config.selected_division = selected_division
          end

          dados_iniciais = {
            version: VERSION,
            server_url: Config.server_url,
            auto_update: Config.auto_update?,
            user: {
              id: user_id,
              name: user_name,
              email: user_email,
              role: user_role,
              allowed_divisions: allowed_divisions
            },
            users: ApiClient.usuarios_padroes,
            selected_division: selected_division,
            largura_cm: Config.largura_cm,
            altura_cm: Config.altura_cm,
            rejunte_cm: Config.rejunte_cm,
            info_selecao: obter_info_selecao,
            pendentes_count: ApiClient.fila_local_contar
          }
          dialog.execute_script("initApp(#{dados_iniciais.to_json});")
        end

        dialog.add_action_callback('inspecionar_selecao') do |_action_context|
          begin
            load File.join(File.dirname(__FILE__), 'geom_engine.rb')
          rescue => _e
          end
          info = obter_info_selecao
          dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
        end

        dialog.add_action_callback('buscar_usuarios') do |_action_context|
          ApiClient.buscar_usuarios do |sucesso, usuarios|
            dialog.execute_script("onUsuariosCarregados(#{usuarios.to_json});")
          end
        end

        dialog.add_action_callback('login') do |_action_context, user_data|
          if user_data && user_data.is_a?(Hash)
            Config.current_user_id = user_data['id'] || ''
            Config.current_user_name = user_data['name'] || ''
            Config.current_user_email = user_data['email'] || ''
            Config.current_user_role = user_data['role'] || 'user'
            divs = user_data['allowed_divisions'] || ['sob_medida']
            if Config.current_user_role == 'admin'
              divs = ['sob_medida', 'incorporadora', 'internacional']
            end
            Config.allowed_divisions = divs
            
            # Ajusta divisão selecionada caso a atual não seja permitida
            sel = Config.selected_division
            unless divs.include?(sel)
              sel = divs.first || 'sob_medida'
              Config.selected_division = sel
            end

            res_user = {
              id: Config.current_user_id,
              name: Config.current_user_name,
              email: Config.current_user_email,
              role: Config.current_user_role,
              allowed_divisions: Config.allowed_divisions,
              selected_division: Config.selected_division
            }
            dialog.execute_script("onLoginSucesso(#{res_user.to_json});")
          end
        end

        dialog.add_action_callback('login_supabase') do |_action_context, creds|
          if creds && creds.is_a?(Hash)
            email = creds['email'].to_s
            pass = creds['password'].to_s
            ApiClient.login_supabase(email, pass) do |sucesso, res_data, code|
              if sucesso
                dialog.execute_script("onLoginSucesso(#{res_data.to_json});")
              else
                err_msg = res_data.is_a?(Hash) ? (res_data['error'] || "Falha HTTP #{code}") : "Credenciais inválidas."
                dialog.execute_script("onLoginErro(#{err_msg.to_json});")
              end
            end
          end
        end

        dialog.add_action_callback('logout') do |_action_context|
          Config.current_user_id = ''
          Config.current_user_name = ''
          Config.current_user_email = ''
          Config.current_user_role = 'user'
          Config.access_token = ''
          Config.refresh_token = ''
          Config.allowed_divisions = ['sob_medida']
          dialog.execute_script("onLogoutSucesso();")
        end

        dialog.add_action_callback('selecionar_divisao') do |_action_context, divisao|
          Config.selected_division = divisao.to_s
        end

        dialog.add_action_callback('listar_orcamentos') do |_action_context, divisao|
          ApiClient.listar_orcamentos_divisao(divisao) do |_sucesso, orcamentos|
            dialog.execute_script("onOrcamentosCarregados(#{orcamentos.to_json});")
          end
        end

        dialog.add_action_callback('buscar_orcamento_codigo') do |_action_context, params|
          codigo = params.is_a?(Hash) ? (params['codigo'] || params['budget_code']) : params.to_s
          divisao = params.is_a?(Hash) ? params['divisao'] : nil
          ApiClient.buscar_orcamento_por_codigo(codigo, divisao) do |sucesso, resultados|
            dialog.execute_script("onResultadoBuscaOrcamento(#{sucesso.to_json}, #{resultados.to_json});")
          end
        end

        dialog.add_action_callback('aplicar_laminacao') do |_action_context|
          res = GeomEngine.aplicar_laminacao_total
          if res[:success]
            dialog.execute_script("showToast('#{res[:message]}', 'success');")
            info = obter_info_selecao
            dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
          else
            dialog.execute_script("showToast('#{res[:error]}', 'error');")
          end
        end

        dialog.add_action_callback('aplicar_materiais_padrao') do |_action_context|
          res = GeomEngine.aplicar_laminacao_total
          if res[:success]
            dialog.execute_script("showToast('#{res[:message]}', 'success');")
            # Reinspeciona seleção
            info = obter_info_selecao
            dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
          else
            dialog.execute_script("showToast('#{res[:error]}', 'error');")
          end
        end

        dialog.add_action_callback('selecionar_faces_laminacao') do |_action_context|
          res = GeomEngine.selecionar_faces_laminacao_3d
          if res[:success]
            dialog.execute_script("showToast('#{res[:message]}', 'info');")
          else
            dialog.execute_script("showToast('#{res[:error]}', 'error');")
          end
        end

        dialog.add_action_callback('selecionar_faces_revestimento') do |_action_context|
          res = GeomEngine.selecionar_faces_revestimento_3d
          if res[:success]
            dialog.execute_script("showToast('#{res[:message]}', 'info');")
          else
            dialog.execute_script("showToast('#{res[:error]}', 'error');")
          end
        end

        dialog.add_action_callback('executar_ajuste') do |_action_context, params|
          begin
            load File.join(File.dirname(__FILE__), 'geom_engine.rb') rescue nil
            largura = params['largura'].to_f
            altura = params['altura'].to_f
            rejunte = params['rejunte'].to_f
            origem = params['origem'] || 'centro'
            canto_ref = params['canto_ref'] || 'inf_esq'
            projeto = params['projeto'] || 'Piscina Sem Nome'
            cliente = params['cliente'] || 'Cliente Geral'
            notas = params['notas'] || ''
            # REGRA ESTRITA: NUNCA modificar a geometria 3D da piscina desenhada pelo usuário
            modificar_3d = false

            Config.largura_cm = largura
            Config.altura_cm = altura
            Config.rejunte_cm = rejunte

            resultado = GeomEngine.ajustar_piscina(largura, altura, rejunte, {
              origem: origem,
              canto_ref: canto_ref,
              projeto: projeto,
              cliente: cliente,
              notas: notas,
              modificar_3d: modificar_3d,
              revestimento: params['coating_type'] || params['revestimento'] || 'pastilha_15x15',
              estrutura: params['structure_type'] || 'nao_autoportante',
              etapa: params['stage'] || 'previa'
            })

            if resultado && resultado[:success]
              @ultimo_resultado = resultado
              dialog.execute_script("onAjusteSucesso(#{resultado.to_json});")
            else
              erro_msg = (resultado && resultado[:error]) ? resultado[:error] : "Erro ao quantificar piscina"
              puts "[PapaSys] Erro em ajustar_piscina: #{erro_msg}"
              dialog.execute_script("onAjusteErro(#{erro_msg.to_json});")
            end
          rescue => e
            puts "[PapaSys] Erro no callback executar_ajuste: #{e.message}\n#{e.backtrace.first(5).join("\n") rescue ''}"
            dialog.execute_script("onAjusteErro(#{e.message.to_json});")
          end
        end

        dialog.add_action_callback('enviar_orcamento') do |_action_context, params|
          ApiClient.enviar_piscina_orcamento(params) do |sucesso, resposta|
            if sucesso
              dialog.execute_script("onEnvioSucesso(#{resposta.to_json});")
            else
              dialog.execute_script("onEnvioErro(#{resposta.to_json});")
            end
          end
        end

        dialog.add_action_callback('reenviar_pendentes') do |_action_context|
          ApiClient.reenviar_pendentes do |sucesso, resposta|
            dialog.execute_script("onReenvioPendentes(#{resposta.to_json});")
          end
        end

        dialog.add_action_callback('abrir_url') do |_action_context, url|
          if url && !url.empty?
            caminho_final = url
            if !url.start_with?('http://') && !url.start_with?('https://') && !url.start_with?('file:///')
              base_web = File.expand_path('../../sistema_web', File.dirname(__FILE__))
              base_web = 'd:/COISAS/SISTEMAS/PapaSys/sistema_web' unless File.directory?(base_web)
              caminho_final = "file:///#{File.join(base_web, url).gsub('\\', '/')}"
            end
            puts "[iGUi] Abrindo página web: #{caminho_final}"
            UI.openURL(caminho_final)
          end
        end

        dialog.add_action_callback('salvar_config') do |_action_context, data|
          if data['server_url']
            Config.server_url = data['server_url']
          end
          if data.key?('auto_update')
            Config.auto_update = data['auto_update']
          end
          dialog.execute_script("showToast('Configurações salvas!', 'success');")
        end

        dialog.add_action_callback('verificar_atualizacao') do |_action_context|
          Updater.recarregar_modulos rescue nil
          Updater.check(silent: false, auto_install: true) do |atualizou, nova_versao, info|
            if atualizou
              dialog.execute_script("showToast('Plugin atualizado para v#{nova_versao}!', 'success'); setTimeout(function(){ window.location.reload(); }, 1200);")
            else
              dialog.execute_script("showToast('#{info}', 'info'); setTimeout(function(){ window.location.reload(); }, 600);")
            end
          end
        end
      end
    end
  end
end
