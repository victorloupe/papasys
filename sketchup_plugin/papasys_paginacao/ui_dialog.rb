# encoding: UTF-8
module PapaSys
  module Paginacao
    module UiDialog
      @dialog = nil
      @ultimo_resultado = nil
      @observer = nil

      class SelectionObserver < Sketchup::SelectionObserver
        def initialize(dialog)
          @dialog = dialog
        end

        def onSelectionBulkChange(_selection)
          notificar
        end

        def onSelectionAdded(_selection, _entity)
          notificar
        end

        def onSelectionRemoved(_selection, _entity)
          notificar
        end

        def onSelectionCleared(_selection)
          notificar
        end

        private

        def notificar
          return unless @dialog && @dialog.visible?
          info = UiDialog.obter_info_selecao
          @dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
        rescue => e
          # Silencioso se o diálogo já fechou
        end
      end

      def self.obter_info_selecao
        modelo = Sketchup.active_model
        return { has_selection: false, message: 'Nenhum modelo aberto' } unless modelo

        selecao = modelo.selection
        if selecao.empty?
          return { has_selection: false, message: 'Nenhuma piscina selecionada no SketchUp' }
        end

        faces = selecao.grep(Sketchup::Face)
        grupos = selecao.grep(Sketchup::Group) + selecao.grep(Sketchup::ComponentInstance)

        bb = Geom::BoundingBox.new
        nome_sugerido = ''

        if !faces.empty?
          faces.each { |f| bb.add(f.bounds) if f.valid? }
          tipo = 'faces'
          desc = "#{faces.length} faces selecionadas"
        elsif !grupos.empty?
          grupos.each do |g|
            bb.add(g.bounds) if g.valid?
            if nome_sugerido.empty?
              nome = g.name.to_s.strip
              nome = g.definition.name.to_s.strip if nome.empty? && g.respond_to?(:definition)
              nome_sugerido = nome unless nome.empty?
            end
          end
          tipo = 'grupo'
          desc = grupos.length == 1 ? 'Piscina 3D Selecionada' : "#{grupos.length} grupos selecionados"
        else
          selecao.each { |e| bb.add(e.bounds) if e.valid? && e.respond_to?(:bounds) }
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

        # Detecta curvas/arcos na geometria selecionada (incluindo sub-grupos aninhados)
        tem_curvas = false
        if !grupos.empty?
          g = grupos.first
          colecoes = GeomEngine.coletar_sub_entidades(g) rescue []
          all_edges = colecoes.map { |c| c[:edges] }.flatten.uniq
          tem_curvas = all_edges.any? { |e| e.curve != nil || e.smooth? || e.soft? }
          if !tem_curvas
            ents = g.is_a?(Sketchup::Group) ? g.entities : g.definition.entities rescue nil
            tem_curvas = ents.grep(Sketchup::Edge).any? { |e| e.curve != nil || e.smooth? } if ents
          end
        elsif !faces.empty?
          tem_curvas = faces.any? { |f| f.edges.any? { |e| e.curve != nil || e.smooth? } }
        else
          tem_curvas = selecao.grep(Sketchup::Edge).any? { |e| e.curve != nil || e.smooth? }
        end

        desc_final = desc
        if tem_curvas && grupos.length == 1
          desc_final = "Piscina Mista (Retas + Curva)"
        end

        puts "[PapaSys] Seleção detectada: #{desc_final} (#{comp}m x #{larg}m x #{prof}m) | Curvas: #{tem_curvas}"

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
          dialog_title: "#{PLUGIN_NAME} v#{VERSION}",
          preferences_key: 'PapaSysPaginacaoDialog',
          scrollable: true,
          resizable: true,
          width: 440,
          height: 600,
          min_width: 380,
          min_height: 500
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
          @observer = SelectionObserver.new(@dialog)
          Sketchup.active_model.selection.add_observer(@observer) rescue nil
        end

        registrar_callbacks(@dialog)

        @dialog.show
      end

      def self.registrar_callbacks(dialog)
        dialog.add_action_callback('ready') do |_action_context|
          dados_iniciais = {
            version: VERSION,
            server_url: Config.server_url,
            auto_update: Config.auto_update?,
            largura_cm: Config.largura_cm,
            altura_cm: Config.altura_cm,
            rejunte_cm: Config.rejunte_cm,
            info_selecao: obter_info_selecao
          }
          dialog.execute_script("initApp(#{dados_iniciais.to_json});")
        end

        dialog.add_action_callback('inspecionar_selecao') do |_action_context|
          load File.join(File.dirname(__FILE__), 'geom_engine.rb') rescue nil
          info = obter_info_selecao
          dialog.execute_script("atualizarInfoSelecao(#{info.to_json});")
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

        dialog.add_action_callback('executar_ajuste') do |_action_context, params|
          # Carrega a versão mais recente do motor geométrico
          load File.join(File.dirname(__FILE__), 'geom_engine.rb') rescue nil

          largura = params['largura'].to_f
          altura = params['altura'].to_f
          rejunte = params['rejunte'].to_f
          origem = params['origem'] || 'centro'
          canto_ref = params['canto_ref'] || 'inf_esq'
          projeto = params['projeto'] || 'Piscina Sem Nome'
          cliente = params['cliente'] || 'Cliente Geral'
          notas = params['notas'] || ''

          Config.largura_cm = largura
          Config.altura_cm = altura
          Config.rejunte_cm = rejunte

          resultado = GeomEngine.ajustar_piscina(largura, altura, rejunte, {
            origem: origem,
            canto_ref: canto_ref,
            projeto: projeto,
            cliente: cliente,
            notas: notas
          })

          @ultimo_resultado = resultado

          if resultado[:success]
            dialog.execute_script("onAjusteSucesso(#{resultado.to_json});")
          else
            dialog.execute_script("onAjusteErro(#{resultado[:error].to_json});")
          end
        end

        dialog.add_action_callback('notificar_envio_concluido') do |_action_context, info|
          puts "\n[PapaSys] ==============================================="
          puts "[PapaSys] ✅ PROJETO GRAVADO NO SUPABASE COM SUCESSO!"
          puts "[PapaSys] ID: #{info['id']} | Projeto: #{info['nome']}"
          puts "[PapaSys] ===============================================\n"
        end

        dialog.add_action_callback('enviar_web') do |_action_context, params|
          dados = @ultimo_resultado || {
            projeto: params['project_name'] || params['projeto'],
            cliente: params['client_name'] || params['cliente'],
            notas: params['notes'] || params['notas'],
            largura_peca_cm: params['tile_width_cm'] || params['largura'].to_f,
            altura_peca_cm: params['tile_height_cm'] || params['altura'].to_f,
            rejunte_cm: params['grout_cm'] || params['rejunte'].to_f,
            area_interna_m2: params['internal_area_m2'] || params['area_m2'].to_f,
            borda_perimetro_linear_m: params['border_perimeter_linear_m'] || params['borda_m'].to_f,
            dimensoes: {}
          }

          ApiClient.enviar_projeto(dados) do |sucesso, resposta|
            if sucesso
              dialog.execute_script("onEnvioSucesso(#{resposta.to_json});")
            else
              dialog.execute_script("onEnvioErro(#{resposta[:error].to_json});")
            end
          end
        end

        dialog.add_action_callback('abrir_url') do |_action_context, url|
          if url && !url.empty?
            caminho_final = url
            if !url.start_with?('http://') && !url.start_with?('https://') && !url.start_with?('file:///')
              # Resolve o caminho do sistema web PapaSys local
              base_web = File.expand_path('../../sistema_web', File.dirname(__FILE__))
              base_web = 'd:/COISAS/SISTEMAS/PapaSys/sistema_web' unless File.directory?(base_web)
              caminho_final = "file:///#{File.join(base_web, url).gsub('\\', '/')}"
            end
            puts "[PapaSys] Abrindo página web: #{caminho_final}"
            UI.openURL(caminho_final)
          end
        end

        dialog.add_action_callback('verificar_atualizacao') do |_action_context|
          Updater.check(silent: false, auto_install: true) do |atualizou, nova_versao, info|
            if atualizou
              dialog.execute_script("showToast('Plugin atualizado para v#{nova_versao}!', 'success'); setTimeout(function(){ window.location.reload(); }, 1200);")
            else
              dialog.execute_script("showToast('#{info}', 'info');")
            end
          end
        end
      end
    end
  end
end
