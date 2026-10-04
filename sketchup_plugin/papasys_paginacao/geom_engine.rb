# encoding: UTF-8

# Compatibilidade de local_bounds para ComponentInstance e Group
if defined?(Sketchup::ComponentInstance)
  class Sketchup::ComponentInstance
    def local_bounds
      self.definition.bounds
    end
  end
end

if defined?(Sketchup::Group)
  class Sketchup::Group
    def local_bounds
      self.definition.bounds rescue self.bounds
    end
  end
end

module PapaSys
  module Paginacao
    module GeomEngine
      # Executa o ajuste inteligente centralizado e calcula com máxima precisão
      # a área líquida de revestimento da piscina (m²) e o perímetro superior (m).
      # Suporta Faces Diretas, Grupos, Componentes e Estruturas Aninhadas (Sub-grupos/Casco/Escadas).
      def self.ajustar_piscina(largura_cm, altura_cm, rejunte_cm, options = {})
        modelo = Sketchup.active_model
        selecao = modelo.selection

        tem_contexto_aberto = (modelo.active_path && !modelo.active_path.empty?) rescue false

        if selecao.empty? && !tem_contexto_aberto
          return { success: false, error: 'Por favor, selecione as faces da piscina OU o grupo/componente.' }
        end

        faces_sel = selecao.grep(Sketchup::Face).select { |f| f.valid? && !f.deleted? }
        grupos_sel = (selecao.grep(Sketchup::Group) + selecao.grep(Sketchup::ComponentInstance)).select { |g| g.valid? }

        is_face_sel = !faces_sel.empty?
        grupo = nil
        mat_forcar = nil
        faces_forcar_ids = nil

        if is_face_sel && faces_sel.length >= 1
          faces_forcar_ids = {}
          faces_sel.each { |f| faces_forcar_ids[f.object_id] = true }
        end

        mod_h = (largura_cm.to_f + rejunte_cm.to_f).cm
        mod_v = (altura_cm.to_f + rejunte_cm.to_f).cm

        if mod_h <= 0.0 || mod_v <= 0.0
          return { success: false, error: 'Dimensões da peça e rejunte devem ser maiores que zero.' }
        end

        origem = (options[:origem] || 'centro').to_s.downcase
        canto_ref = (options[:canto_ref] || 'inf_esq').to_s.downcase
        modificar_3d = options.key?(:modificar_3d) ? !!options[:modificar_3d] : true
        largura_borda_cm_op = (options[:largura_borda_cm] || 20.0).to_f

        colecoes = []
        if is_face_sel
          # Identifica o material da face/superfície clicada pelo usuário (priorizando o material com textura
          # tanto na frente quanto no verso da face, para suportar faces invertidas em piscinas curvas/mistas!)
          mats_sel = faces_sel.flat_map { |f| [f.material, f.back_material] }.compact
          mat_u = mats_sel.find { |m| m.texture != nil && !nome_material_externo?(m.name) } ||
                  mats_sel.find { |m| m.texture != nil } ||
                  mats_sel.find { |m| !nome_material_externo?(m.name) } ||
                  mats_sel.first

          if tem_contexto_aberto
            # Usuário abriu o grupo da piscina (active_path) e clicou em uma face ou parede curva lá dentro:
            # Coleta todas as entidades do grupo da piscina (incluindo paredes curvas, escadas, piso e borda!)
            colecoes = coletar_contexto_aberto(modelo)
            mat_forcar = mat_u if mat_u && !nome_material_laminacao?(mat_u.name)
            is_face_sel = false if faces_sel.length <= 1
          else
            # Piscina desagrupada na raiz: expande para toda a malha conectada e grupos/faces da piscina na raiz
            conectadas = faces_sel.map { |f| f.all_connected rescue [] }.flatten.uniq
            faces_con = conectadas.grep(Sketchup::Face).select { |f| f.valid? && !f.deleted? }
            edges_con = conectadas.grep(Sketchup::Edge).select { |e| e.valid? && !e.deleted? }

            # Se houver mais faces/grupos na cena raiz com o mesmo material da piscina (ex: parede curva desconectada), inclui também
            if mat_u
              todas_faces_raiz = modelo.active_entities.grep(Sketchup::Face).select { |f| f.valid? && !f.deleted? }
              faces_mesmo_mat = todas_faces_raiz.select do |f|
                [f.material, f.back_material].compact.any? { |m| m == mat_u || m.name == mat_u.name }
              end
              if faces_mesmo_mat.length > faces_con.count { |f| [f.material, f.back_material].compact.any? { |m| m == mat_u || m.name == mat_u.name } }
                conectadas_extra = faces_mesmo_mat.map { |f| f.all_connected rescue [f] }.flatten.uniq
                faces_con = (faces_con + conectadas_extra.grep(Sketchup::Face).select { |f| f.valid? && !f.deleted? }).uniq
                edges_con = (edges_con + conectadas_extra.grep(Sketchup::Edge).select { |e| e.valid? && !e.deleted? }).uniq
              end
            end

            if faces_con.length > 1
              mat_forcar = mat_u if mat_u
              is_face_sel = false
              colecoes << {
                owner: modelo,
                entities: modelo.active_entities,
                transform: Geom::Transformation.new,
                inherited_mat: nil,
                faces: faces_con,
                edges: edges_con
              }
            end
          end

          if colecoes.empty?
            colecoes << {
              owner: modelo,
              entities: modelo.active_entities,
              transform: Geom::Transformation.new,
              inherited_mat: nil,
              faces: faces_sel,
              edges: faces_sel.map(&:edges).flatten.uniq
            }
          end
        elsif !grupos_sel.empty?
          grupos_sel.each do |grp|
            grp.make_unique if modificar_3d && grp.respond_to?(:make_unique) rescue nil

            t_raiz = grp.transformation rescue Geom::Transformation.new
            mat_raiz = (grp.respond_to?(:material) ? grp.material : nil) rescue nil
            sub_cols = coletar_sub_entidades(grp, t_raiz, [0], 25000, mat_raiz)

            if sub_cols.empty?
              ents_diretas = grp.is_a?(Sketchup::Group) ? grp.entities : grp.definition.entities rescue nil
              if ents_diretas
                sub_cols << {
                  owner: grp,
                  entities: ents_diretas,
                  transform: t_raiz,
                  inherited_mat: mat_raiz,
                  faces: ents_diretas.grep(Sketchup::Face),
                  edges: ents_diretas.grep(Sketchup::Edge)
                }
              end
            end
            colecoes.concat(sub_cols)
          end
        elsif tem_contexto_aberto
          colecoes = coletar_contexto_aberto(modelo)
          is_face_sel = false
        else
          return { success: false, error: 'Por favor, selecione as faces da piscina ou o grupo/componente.' }
        end

        # Identifica previamente as faces de revestimento interno para usar seu centro/canto real como Ponto Zero
        faces_info_pre = extrair_faces_info(colecoes)
        info_borda_pre = analisar_borda_topo(faces_info_pre)
        faces_revest_pre = selecionar_faces_revestimento(faces_info_pre, is_face_sel, mat_forcar, faces_forcar_ids, info_borda_pre)
        bb_inicial = (info_borda_pre[:borda_3d_plana] && info_borda_pre[:bb_interno]) ? info_borda_pre[:bb_interno] : calcular_bounds_de_faces(faces_revest_pre, colecoes)
        ponto_zero = calcular_ponto_zero(bb_inicial, origem, canto_ref)

        # ======================================================================
        # 1. ANÁLISE DE CURVAS E GEOMETRIAS ORGÂNICAS
        # ======================================================================
        curves_map = {}
        tem_smooth = false
        total_edges_count = 0

        colecoes.each do |c_info|
          c_info[:edges].each do |e|
            next unless e.valid?
            total_edges_count += 1
            cv = e.curve
            if cv
              curves_map[cv.object_id] = cv
            elsif !tem_smooth && (e.smooth? || e.soft?)
              tem_smooth = true
            end
          end
        end

        curves = curves_map.values
        tem_curvas = !curves.empty? || tem_smooth

        # ======================================================================
        # 2. ETAPA DE AJUSTE 3D (Executada ANTES de coletar as medidas finais)
        # ======================================================================
        total_pontos_ajustados = 0

        if !modificar_3d
          puts "[PapaSys] Modo 'Enviar Sem Ajustar': mantendo geometria 3D original e lendo quantitativos."
        elsif tem_curvas
          puts "[PapaSys] Curvas detectadas: Formato 3D orgânico mantido 100% intacto."
        elsif total_edges_count > 2500
          puts "[PapaSys] Geometria de alta densidade (#{total_edges_count} arestas): preservando malha original."
        else
          modelo.start_operation("PapaSys: Ajuste Inteligente #{largura_cm}x#{altura_cm}", true)
          defs_processadas = {}

          # Coleta globalmente os pontos do revestimento interno vs todos os pontos (incluindo borda/casco)
          xs_ref_global = []
          ys_ref_global = []
          zs_ref_global = []
          faces_revest_pre.each do |fi|
            t_f = fi[:transform] || Geom::Transformation.new
            fi[:face].vertices.each do |v|
              next unless v.valid?
              pt = t_f * v.position
              xs_ref_global << pt.x.to_f
              ys_ref_global << pt.y.to_f
              zs_ref_global << pt.z.to_f
            end rescue nil
          end

          # Se a borda superior plana 360° possui loop interno explícito, restringe xs_ref_global e ys_ref_global
          # estritamente ao limite interno da borda para que as paredes externas NUNCA entrem em xs_ref_global!
          if info_borda_pre[:tem_borda] && info_borda_pre[:borda_3d_plana] && info_borda_pre[:bb_interno]
            bb_int_pre = info_borda_pre[:bb_interno]
            xs_ref_filtrados = xs_ref_global.select { |x| x >= (bb_int_pre.min.x - 1.0.cm) && x <= (bb_int_pre.max.x + 1.0.cm) }
            ys_ref_filtrados = ys_ref_global.select { |y| y >= (bb_int_pre.min.y - 1.0.cm) && y <= (bb_int_pre.max.y + 1.0.cm) }
            xs_ref_global = xs_ref_filtrados unless xs_ref_filtrados.empty?
            ys_ref_global = ys_ref_filtrados unless ys_ref_filtrados.empty?
          end

          xs_all_global = []
          ys_all_global = []
          zs_all_global = []
          colecoes.each do |c_info|
            t_c = c_info[:transform] || Geom::Transformation.new
            c_info[:edges].each do |e|
              next unless e.valid?
              e.vertices.each do |v|
                next unless v.valid?
                pt = t_c * v.position
                xs_all_global << pt.x.to_f
                ys_all_global << pt.y.to_f
                zs_all_global << pt.z.to_f
              end
            end
          end

          xs_ref_global = xs_all_global if xs_ref_global.empty?
          ys_ref_global = ys_all_global if ys_ref_global.empty?
          zs_ref_global = zs_all_global if zs_ref_global.empty?

          # Define a largura padrão da borda para garantir que TODOS os 4 lados da borda fiquem com a mesma largura!
          largura_borda_alvo = detectar_largura_borda_padrao(xs_all_global, ys_all_global, xs_ref_global, ys_ref_global, largura_borda_cm_op)

          mapa_x = criar_mapa_snap_eixo(xs_all_global, ponto_zero.x.to_f, mod_h.to_f, xs_ref_global, largura_borda_alvo)
          mapa_y = criar_mapa_snap_eixo(ys_all_global, ponto_zero.y.to_f, mod_h.to_f, ys_ref_global, largura_borda_alvo)
          mapa_z = criar_mapa_snap_eixo(zs_all_global, ponto_zero.z.to_f, mod_v.to_f, zs_ref_global, nil)

          colecoes.each do |c_info|
            ents_obj = c_info[:entities]
            next if defs_processadas[ents_obj.object_id]
            defs_processadas[ents_obj.object_id] = true

            edges = c_info[:edges]
            next if edges.empty? || edges.length > 1200

            t = c_info[:transform]
            t_inv = t.inverse rescue Geom::Transformation.new

            verts_map = {}
            edges.each do |e|
              next unless e.valid?
              e.vertices.each { |v| verts_map[v.object_id] = v if v.valid? }
            end
            c_verts = verts_map.values
            next if c_verts.empty?

            pts_mover = []
            vecs_mover = []

            c_verts.each do |v|
              pt_local = v.position
              pt_global = t * pt_local

              novo_x = aplicar_snap_eixo(pt_global.x.to_f, mapa_x)
              novo_y = aplicar_snap_eixo(pt_global.y.to_f, mapa_y)
              novo_z = aplicar_snap_eixo(pt_global.z.to_f, mapa_z)

              novo_pt_global = Geom::Point3d.new(novo_x, novo_y, novo_z)

              if pt_global.distance(novo_pt_global) > 0.001
                novo_pt_local = t_inv * novo_pt_global
                pts_mover << v
                vecs_mover << pt_local.vector_to(novo_pt_local)
              end
            end

            if !pts_mover.empty?
              ents_obj.transform_by_vectors(pts_mover, vecs_mover)
              total_pontos_ajustados += pts_mover.length
            end
          end

          modelo.commit_operation
          modelo.active_view.invalidate rescue nil
        end

        # ======================================================================
        # 3. LEITURA PÓS-AJUSTE: Extrai área, dimensões e bordas (interna e externa) DEPOIS de ajustar!
        # ======================================================================
        all_faces_info = extrair_faces_info(colecoes)
        info_borda_pos = analisar_borda_topo(all_faces_info)
        faces_revest = selecionar_faces_revestimento(all_faces_info, is_face_sel, mat_forcar, faces_forcar_ids, info_borda_pos)

        # Dimensões internas reais calculadas a partir das faces de revestimento pós-ajuste
        bb_pos = calcular_bounds_de_faces(faces_revest, colecoes)

        w_m = (bb_pos.width.to_f * 0.0254).round(2)
        h_m = (bb_pos.height.to_f * 0.0254).round(2)
        d_m = (bb_pos.depth.to_f * 0.0254).round(2)

        dims = {
          comprimento_m: [w_m, h_m].max,
          largura_m: [w_m, h_m].min,
          profundidade_m: d_m
        }

        # Comprimento linear desenvolvido de curva horizontal pós-ajuste
        curves_horizontais = curves.select do |c|
          pts = c.vertices rescue []
          pts.length >= 2 && (pts.first.position.z - pts.last.position.z).abs < 8.0.cm
        end

        comp_curva_horizontal_m = 0.0
        if !curves_horizontais.empty?
          comp_curva_horizontal_m = curves_horizontais.map { |c| c.length.to_f * 0.0254 }.max
        elsif !curves.empty?
          comp_curva_horizontal_m = (curves.first.length.to_f * 0.0254 rescue 0.0)
        end

        area_total_m2, borda_interna_m, borda_externa_m, largura_borda_m = calcular_quantitativos_de_revest(
          faces_revest, all_faces_info, bb_pos, dims, colecoes, info_borda_pos, largura_borda_cm_op
        )

        area_com_perda_10 = (area_total_m2 * 1.10).round(2)
        area_com_perda_15 = (area_total_m2 * 1.15).round(2)
        pecas_curva = comp_curva_horizontal_m > 0 ? (comp_curva_horizontal_m / ((largura_cm.to_f + rejunte_cm.to_f) / 100.0)).round : 0

        # Cálculo dos quantitativos iGUi (Revestimento, Laminação, Volume, Cantos e Acabamentos)
        dados_igui = calcular_quantitativos_igui(faces_revest, all_faces_info, bb_pos, dims, options)

        puts "[PapaSys/iGUi] Quantitativos -> Comp: #{dims[:comprimento_m]}m | Larg: #{dims[:largura_m]}m | Prof: #{dims[:profundidade_m]}m"
        puts "[PapaSys/iGUi] Revestimento: #{dados_igui[:area_revestimento_m2]} m² | Laminação: #{dados_igui[:area_laminacao_m2]} m²"
        puts "[PapaSys/iGUi] Volume: #{dados_igui[:volume_m3]} m³ (#{dados_igui[:volume_litros]} L) | Cantos: #{dados_igui[:cantos_lineares_m]} m | Quinas Vivas: #{dados_igui[:quinas_vivas_count]}"

        {
          success: true,
          ajustado_3d: modificar_3d,
          modo_selecao: is_face_sel ? 'faces_selecionadas' : 'grupo_completo',
          projeto: options[:projeto] || 'Piscina iGUi 3D',
          cliente: options[:cliente] || 'Cliente Geral',
          notas: options[:notas] || '',
          largura_peca_cm: largura_cm.to_f,
          altura_peca_cm: altura_cm.to_f,
          rejunte_cm: rejunte_cm.to_f,
          mod_horizontal_cm: (largura_cm.to_f + rejunte_cm.to_f).round(3),
          mod_vertical_cm: (altura_cm.to_f + rejunte_cm.to_f).round(3),
          origem_modulacao: modificar_3d ? origem : 'original',
          tem_curvas: tem_curvas,
          comprimento_curva_m: comp_curva_horizontal_m.round(2),
          qtd_pastilhas_curva: pecas_curva,
          curvas_detectadas: curves.length,
          
          # Quantitativos iGUi (Seções 7 e 8)
          area_interna_m2: dados_igui[:area_revestimento_m2],
          area_revestimento_m2: dados_igui[:area_revestimento_m2],
          area_laminacao_m2: dados_igui[:area_laminacao_m2],
          volume_m3: dados_igui[:volume_m3],
          volume_litros: dados_igui[:volume_litros],
          internal_volume_m3: dados_igui[:volume_m3],
          internal_volume_liters: dados_igui[:volume_litros],
          linear_corners_m: dados_igui[:cantos_lineares_m],
          linear_corners_cm: dados_igui[:cantos_lineares_cm],
          alive_corners_count: dados_igui[:quinas_vivas_count],
          finishes: dados_igui[:acabamentos],
          has_explicit_revest: dados_igui[:has_explicit_revest],
          has_explicit_lamina: dados_igui[:has_explicit_lamina],

          area_perda_10_m2: area_com_perda_10,
          area_perda_15_m2: area_com_perda_15,
          borda_perimetro_linear_m: borda_interna_m.round(2),
          borda_interna_m: borda_interna_m.round(2),
          borda_externa_m: borda_externa_m.round(2),
          largura_borda_m: largura_borda_m.round(2),
          pontos_ajustados: total_pontos_ajustados,
          dimensoes: dims,
          timestamp: Time.now.strftime('%Y-%m-%d %H:%M:%S')
        }
      rescue => e
        modelo.abort_operation rescue nil
        puts "[PapaSys] ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n") rescue ''}"
        { success: false, error: "Erro durante o processamento: #{e.message}" }
      end

      # Verifica se o nome do material indica elemento de laminação / fibra / gel / cinza
      def self.nome_material_laminacao?(nome)
        return false if nome.nil?
        n = nome.to_s.downcase
        return false if n.include?('pastilha') || n.include?('azulejo') || n.include?('revestimento') ||
                        n.include?('porcelanato') || n.include?('mosaico') || n.include?('ceramica') ||
                        n.include?('azul') || n.include?('water') || n.include?('agua')

        n.include?('laminac') || n.include?('laminaç') || n.include?('lamina') ||
        n.include?('fibra') || n.include?('casco') || n.include?('gel') ||
        n.include?('exterior') || n.include?('externo') ||
        n == 'cinza' || n == 'gray' || n == 'grey' || n.include?('gelcoat')
      end

      # Verifica se o material ou sua cor representa a laminação (cinza típico iGUi)
      def self.cor_material_laminacao?(mat)
        return false if mat.nil?
        # NUNCA classifica material com textura (imagem de pastilha, mosaico, etc.) como laminação gelcoat
        return false if mat.texture != nil
        return true if nome_material_laminacao?(mat.name)
        c = mat.color rescue nil
        if c
          r, g, b = c.red, c.green, c.blue
          diff_rg = (r - g).abs
          diff_gb = (g - b).abs
          diff_rb = (r - b).abs
          # Tons de cinza neutros / cinza escuro (baixa saturação, média/baixa luminosidade típica do casco iGUi)
          return true if diff_rg <= 20 && diff_gb <= 20 && diff_rb <= 20 && r >= 35 && r <= 210
        end
        false
      end

      # Verifica se o nome do material indica elemento externo (borda, deck, grama, concreto, laminação)
      def self.nome_material_externo?(nome)
        return false if nome.nil?
        n = nome.to_s.downcase
        n.include?('borda') || n.include?('deck') || n.include?('grama') || n.include?('concreto') || nome_material_laminacao?(n)
      end

      # Classificação geométrica estrita e robusta de faces da piscina iGUi:
      # - Laminação: Toda a casca externa cinza (paredes externas, fundo externo, recuo dos degraus por fora,
      #              aba inferior/externa da borda e lip vertical externo da borda).
      # - Revestimento: Todas as superfícies em contato com a água na cavidade interna (fundo interno,
      #                 paredes internas voltadas para a água, pisos e espelhos dos degraus da escada).
      def self.classificar_faces_geometricamente(all_faces_info)
        return { faces_revest: [], faces_lamina: [] } if all_faces_info.empty?

        max_z = all_faces_info.map { |fi| fi[:max_z] }.max || 0.0
        min_z = all_faces_info.map { |fi| fi[:center].z }.min || 0.0

        xs = all_faces_info.map { |fi| fi[:center].x }
        ys = all_faces_info.map { |fi| fi[:center].y }
        cx = (xs.min + xs.max) / 2.0
        cy = (ys.min + ys.max) / 2.0

        z_limite_borda = max_z - 4.0.cm

        faces_revest = []
        faces_lamina = []

        all_faces_info.each do |fi|
          norm = fi[:normal]
          cz = fi[:center].z
          center = fi[:center]

          # 1. Borda superior plana (deck/lip de acabamento):
          # Toda face horizontal no topo da piscina é borda (laminação), NUNCA revestimento interno!
          if norm.z > 0.3 && cz >= z_limite_borda
            faces_lamina << fi
            next
          end

          # 2. Superfície horizontal apontando para baixo (fundo externo ou aba inferior da borda):
          if norm.z < -0.15
            faces_lamina << fi
            next
          end

          # 3. Se for material de borda, deck ou laminação explícita:
          mats = [fi[:material], fi[:front_mat], (fi[:face].back_material rescue nil)].compact
          if mats.any? { |m| m && (nome_material_externo?(m.name) || cor_material_laminacao?(m)) }
            faces_lamina << fi
            next
          end

          # 4. Prioridade por REVESTIMENTO: se tem textura ou nome indica revestimento/pastilha/azulejo
          tem_rev_mat = fi[:tem_textura] || mats.any? { |m| m && (m.name.to_s.downcase.include?('revestimento') || m.name.to_s.downcase.include?('pastilha') || m.name.to_s.downcase.include?('azulejo') || m.name.to_s.downcase.include?('azul') || m.name.to_s.downcase.include?('porcelanato')) }
          if tem_rev_mat
            faces_revest << fi
            next
          end

          # 5. Superfície horizontal apontando para cima (abaixo do topo da borda):
          # É fundo interno da piscina, patamares e pisos dos degraus da escada interna
          if norm.z > 0.3
            faces_revest << fi
            next
          end

          # 4. Paredes verticais ou inclinadas (|norm.z| <= 0.3):
          # Testa direção em relação ao centro da cavidade da piscina (cx, cy)
          vec_to_center = Geom::Vector3d.new(cx - center.x, cy - center.y, 0)
          dist_2d = vec_to_center.length

          if dist_2d > 0.01
            dot = (norm.x * vec_to_center.x + norm.y * vec_to_center.y) / dist_2d
            if dot > 0.0
              # Normal aponta para dentro do centro da piscina (água) -> Revestimento interno
              faces_revest << fi
            else
              # Normal aponta para fora do centro da piscina -> Parede externa do casco (Laminação)
              faces_lamina << fi
            end
          else
            faces_revest << fi
          end
        end

        { faces_revest: faces_revest, faces_lamina: faces_lamina }
      end

      # Extrai metadados geométricos e materiais de todas as faces
      def self.extrair_faces_info(colecoes)
        all_faces_info = []

        colecoes.each do |c_info|
          t = c_info[:transform]
          mat_herdado = c_info[:inherited_mat]
          x_scale = (t * Geom::Vector3d.new(1, 0, 0)).length rescue 1.0
          y_scale = (t * Geom::Vector3d.new(0, 1, 0)).length rescue 1.0
          scale_area = (x_scale * y_scale).to_f
          scale_area = 1.0 if scale_area <= 0.0001

          c_info[:faces].each do |f|
            next unless f.valid? && !f.deleted?
            norm_global = (t * f.normal).normalize rescue f.normal
            pts_f = f.vertices.map { |v| t * v.position } rescue []
            if !pts_f.empty?
              cx = pts_f.inject(0.0) { |s, p| s + p.x } / pts_f.length
              cy = pts_f.inject(0.0) { |s, p| s + p.y } / pts_f.length
              cz = pts_f.inject(0.0) { |s, p| s + p.z } / pts_f.length
              centro_global = Geom::Point3d.new(cx, cy, cz)
              max_z_global = pts_f.map(&:z).max
              min_z_face = pts_f.map(&:z).min
            else
              centro_global = t * f.bounds.center rescue f.bounds.center
              max_z_global = (t * f.bounds.max).z rescue f.bounds.max.z
              min_z_face = (t * f.bounds.min).z rescue f.bounds.min.z
            end

            area_inches = (f.area(t) rescue (f.area * scale_area)).to_f

            # Coleta materiais da frente, do verso e herdados do grupo/componente.
            # Prioriza o material com textura de revestimento (frente ou verso) para que faces invertidas
            # ou cujo verso foi pintado sobre o casco cinza nunca percam o material de revestimento!
            mats_todos = [f.material, f.back_material, mat_herdado].compact.uniq
            mat_tex = mats_todos.find { |m| m.texture != nil && !nome_material_externo?(m.name) } ||
                      mats_todos.find { |m| m.texture != nil }
            mat_visivel = mat_tex || f.material || f.back_material || mat_herdado

            all_faces_info << {
              face: f,
              pts: pts_f,
              area_m2: (area_inches * 0.00064516).to_f,
              material: mat_visivel,
              front_mat: f.material,
              back_mat: f.back_material,
              mats: mats_todos,
              tem_textura: !(mat_visivel.nil? || mat_visivel.texture.nil?),
              fundo_externo_laje: false,
              normal: norm_global,
              center: centro_global,
              max_z: max_z_global,
              min_z: min_z_face,
              transform: t
            }
          end
        end

        # Detecta geometricamente o fundo inferior oculto de laje dupla (ex: piscina com espessura de concreto no fundo
        # onde a face inferior externa em min_z_global aponta para baixo sem textura frontal, e existe o piso real acima)
        if !all_faces_info.empty?
          min_z_global = all_faces_info.map { |fi| fi[:min_z] }.min
          pisos_elevados = all_faces_info.select do |fi|
            fi[:normal].z.abs > 0.7 &&
              fi[:center].z >= (min_z_global + 1.5.cm) &&
              fi[:center].z <= (min_z_global + 45.0.cm) &&
              fi[:area_m2] >= 0.8
          end
          if !pisos_elevados.empty?
            maior_piso_elevado = pisos_elevados.map { |fi| fi[:area_m2] }.max || 0.0
            all_faces_info.each do |fi|
              if fi[:normal].z < -0.7 && (fi[:center].z - min_z_global).abs < 2.5.cm
                sem_tex_frente = fi[:front_mat].nil? || fi[:front_mat].texture.nil?
                if sem_tex_frente && maior_piso_elevado >= (fi[:area_m2] * 0.40)
                  fi[:fundo_externo_laje] = true
                end
              end
            end
          end
        end

        all_faces_info
      end

      # Analisa topologicamente a borda da piscina (plana em z ≈ max_z_global OU em degrau/curva rebaixada),
      # separando o loop interno (Perímetro Borda Interna) do loop externo (Perímetro Borda Externa).
      def self.analisar_borda_topo(all_faces_info)
        vazio = {
          tem_borda: false,
          borda_3d_plana: false,
          faces_topo: [],
          bb_interno: nil,
          bb_externo: nil,
          perim_interno_m: 0.0,
          perim_externo_m: 0.0,
          largura_borda_m: 0.0
        }
        return vazio if all_faces_info.empty?

        max_z_global = all_faces_info.map { |fi| fi[:max_z] }.max
        faces_topo = all_faces_info.select do |fi|
          fi[:normal].z.abs > 0.7 && (fi[:center].z >= (max_z_global - 3.5.cm))
        end
        return vazio if faces_topo.empty?

        topo_faces_map = {}
        nomes_mat_borda = {}
        faces_topo.each do |fi|
          topo_faces_map[fi[:face]] = fi[:transform] || Geom::Transformation.new
          nomes_mat_borda[fi[:material].name] = true if fi[:material] && !fi[:tem_textura]
          (fi[:mats] || []).each { |m| nomes_mat_borda[m.name] = true if m && m.texture.nil? }
        end

        # 1. Tenta extrair loops 3D diretos da borda plana superior (z ≈ max_z_global)
        boundary_edges = []
        seen_edges = {}
        faces_topo.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          next unless f.valid? && !f.deleted?
          f.edges.each do |e|
            next unless e.valid? && !e.deleted?
            next if seen_edges[e.object_id]
            seen_edges[e.object_id] = true
            count_topo = e.faces.count { |cf| cf.valid? && topo_faces_map.key?(cf) }
            boundary_edges << { edge: e, transform: t } if count_topo == 1
          end
        end

        componentes = agrupar_arestas_em_loops_3d(boundary_edges)
        componentes.sort_by! { |c| -c[:span_2d] }

        if componentes.length >= 2
          comp_ext = componentes[0]
          comp_int = componentes[1]
          bb_ext = comp_ext[:bb]
          bb_int = comp_int[:bb]

          bx_min = (bb_int.min.x - bb_ext.min.x).to_f * 0.0254
          bx_max = (bb_ext.max.x - bb_int.max.x).to_f * 0.0254
          by_min = (bb_int.min.y - bb_ext.min.y).to_f * 0.0254
          by_max = (bb_ext.max.y - bb_int.max.y).to_f * 0.0254
          b_lados = [bx_min, bx_max, by_min, by_max]
          # Borda 360° plana válida: envolve todos os 4 lados com largura uniforme (3cm a 55cm) e cavidade interna proporcional
          borda_uniforme = b_lados.all? { |b| b >= 0.03 && b <= 0.55 } &&
                           (b_lados.max - b_lados.min) <= 0.08 &&
                           comp_ext[:len_m] > (comp_int[:len_m] + 0.25) &&
                           bb_int.width >= (bb_ext.width * 0.60) &&
                           bb_int.height >= (bb_ext.height * 0.60)
          if borda_uniforme
            larg_borda_m = (b_lados.inject(0.0, :+) / 4.0).round(2)
            return {
              tem_borda: true,
              borda_3d_plana: true,
              faces_topo: faces_topo,
              bb_interno: bb_int,
              bb_externo: bb_ext,
              perim_interno_m: comp_int[:len_m],
              perim_externo_m: comp_ext[:len_m],
              largura_borda_m: larg_borda_m
            }
          end
        end

        # 2. Suporte a Piscina Curva / Visor com Borda em Níveis Diferentes (ex: PERLAGE MURANO / Agrupar#3):
        # Projeta no plano 2D XY todas as faces horizontais superiores que compartilham o material da borda!
        faces_borda_2d = all_faces_info.select do |fi|
          next false unless fi[:normal].z.abs > 0.7
          if topo_faces_map.key?(fi[:face])
            true
          elsif fi[:center].z >= (max_z_global - 55.0.cm) && !fi[:tem_textura] &&
                ((fi[:material] && nomes_mat_borda[fi[:material].name]) || (fi[:mats] || []).any? { |m| m && nomes_mat_borda[m.name] })
            true
          else
            false
          end
        end

        if !faces_borda_2d.empty?
          comps_2d = extrair_loops_2d_xy(faces_borda_2d)
          if comps_2d.length >= 2
            comp_ext = comps_2d[0]
            comp_int = comps_2d[1]
            bb_ext = comp_ext[:bb]
            bb_int = comp_int[:bb]

            bx_min = (bb_int.min.x - bb_ext.min.x).to_f * 0.0254
            bx_max = (bb_ext.max.x - bb_int.max.x).to_f * 0.0254
            by_min = (bb_int.min.y - bb_ext.min.y).to_f * 0.0254
            by_max = (bb_ext.max.y - bb_int.max.y).to_f * 0.0254
            b_validas = [bx_min, bx_max, by_min, by_max].select { |b| b >= 0.03 && b <= 0.65 }
            cavidade_valida = bb_int.width >= (bb_ext.width * 0.55) && bb_int.height >= (bb_ext.height * 0.55)
            if b_validas.length >= 2 && comp_ext[:len_m] > (comp_int[:len_m] + 0.20) && cavidade_valida
              larg_borda_m = (b_validas.inject(0.0, :+) / b_validas.length).round(2)
              return {
                tem_borda: true,
                borda_3d_plana: false,
                faces_topo: faces_topo,
                bb_interno: bb_int,
                bb_externo: bb_ext,
                perim_interno_m: comp_int[:len_m],
                perim_externo_m: comp_ext[:len_m],
                largura_borda_m: larg_borda_m
              }
            end
          end
        end

        if !componentes.empty?
          {
            tem_borda: false,
            borda_3d_plana: false,
            faces_topo: faces_topo,
            bb_interno: nil,
            bb_externo: componentes[0][:bb],
            perim_interno_m: 0.0,
            perim_externo_m: componentes[0][:len_m],
            largura_borda_m: 0.0
          }
        else
          vazio
        end
      end

      # Agrupa arestas 3D em loops conexos por vértices compartilhados
      def self.agrupar_arestas_em_loops_3d(boundary_edges)
        return [] if boundary_edges.empty?

        vert_to_edges = {}
        boundary_edges.each_with_index do |item, idx|
          item[:edge].vertices.each do |v|
            (vert_to_edges[v.object_id] ||= []) << idx
          end
        end

        visitados = {}
        componentes = []

        boundary_edges.each_index do |idx|
          next if visitados[idx]
          fila = [idx]
          visitados[idx] = true
          comp_items = []

          until fila.empty?
            atual = fila.shift
            item_atual = boundary_edges[atual]
            comp_items << item_atual
            item_atual[:edge].vertices.each do |v|
              (vert_to_edges[v.object_id] || []).each do |viz_idx|
                unless visitados[viz_idx]
                  visitados[viz_idx] = true
                  fila << viz_idx
                end
              end
            end
          end

          bb_c = Geom::BoundingBox.new
          len_m = 0.0
          comp_items.each do |it|
            e = it[:edge]
            t = it[:transform]
            p1 = t * e.start.position
            p2 = t * e.end.position
            bb_c.add(p1)
            bb_c.add(p2)
            len_m += (p1.distance(p2).to_f * 0.0254)
          end

          if len_m >= 1.0
            componentes << {
              items: comp_items,
              bb: bb_c,
              len_m: len_m.round(2),
              span_2d: (bb_c.width.to_f + bb_c.height.to_f)
            }
          end
        end

        componentes
      end

      # Projeta faces horizontais da borda em 2D XY para unir bordas em níveis diferentes (ex: piscina curva)
      def self.extrair_loops_2d_xy(faces_borda_2d)
        edge_map_2d = {}

        faces_borda_2d.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          next unless f.valid? && !f.deleted?
          seen_in_face = {}
          f.edges.each do |e|
            next unless e.valid? && !e.deleted?
            p1 = t * e.start.position
            p2 = t * e.end.position
            len_2d = Math.hypot((p2.x - p1.x).to_f, (p2.y - p1.y).to_f)
            next if len_2d < 0.05

            k1 = [(p1.x.to_f * 5.0).round, (p1.y.to_f * 5.0).round]
            k2 = [(p2.x.to_f * 5.0).round, (p2.y.to_f * 5.0).round]
            next if k1 == k2
            ekey = [k1, k2].sort
            next if seen_in_face[ekey]
            seen_in_face[ekey] = true

            if edge_map_2d[ekey]
              edge_map_2d[ekey][:count] += 1
            else
              edge_map_2d[ekey] = {
                count: 1,
                k1: k1,
                k2: k2,
                p1: Geom::Point3d.new(p1.x, p1.y, 0),
                p2: Geom::Point3d.new(p2.x, p2.y, 0),
                len_m: len_2d * 0.0254
              }
            end
          end
        end

        boundary_2d = edge_map_2d.values.select { |it| it[:count] == 1 }
        return [] if boundary_2d.empty?

        v_to_e = {}
        boundary_2d.each_with_index do |it, idx|
          (v_to_e[it[:k1]] ||= []) << idx
          (v_to_e[it[:k2]] ||= []) << idx
        end

        visitados = {}
        comps = []

        boundary_2d.each_index do |idx|
          next if visitados[idx]
          fila = [idx]
          visitados[idx] = true
          items = []

          until fila.empty?
            at = fila.shift
            it_at = boundary_2d[at]
            items << it_at
            [it_at[:k1], it_at[:k2]].each do |vk|
              (v_to_e[vk] || []).each do |viz|
                unless visitados[viz]
                  visitados[viz] = true
                  fila << viz
                end
              end
            end
          end

          bb_c = Geom::BoundingBox.new
          len_m = 0.0
          items.each do |it|
            bb_c.add(it[:p1])
            bb_c.add(it[:p2])
            len_m += it[:len_m]
          end

          if len_m >= 1.0
            comps << {
              bb: bb_c,
              len_m: len_m.round(2),
              span_2d: (bb_c.width.to_f + bb_c.height.to_f)
            }
          end
        end

        comps.sort_by { |c| -c[:span_2d] }
      end

      # Seleciona com precisão cirúrgica apenas as faces do revestimento interno (azulejo/pastilha/vinil),
      # separando-as do casco externo e da borda superior.
      def self.selecionar_faces_revestimento(all_faces_info, is_face_sel, mat_forcar = nil, faces_forcar_ids = nil, info_borda = nil)
        return all_faces_info if all_faces_info.empty?

        if faces_forcar_ids && !faces_forcar_ids.empty?
          escolhidas_ids = all_faces_info.select do |fi|
            faces_forcar_ids.is_a?(Hash) ? faces_forcar_ids[fi[:face].object_id] : faces_forcar_ids.include?(fi[:face].object_id)
          end
          return escolhidas_ids unless escolhidas_ids.empty?
        end

        return all_faces_info if is_face_sel && mat_forcar.nil?

        # 1. Classificação geométrica estrita (identifica 100% das faces internas mesmo se toda a piscina for cinza!)
        geom = classificar_faces_geometricamente(all_faces_info)
        return geom[:faces_revest] if geom[:faces_revest] && !geom[:faces_revest].empty?

        info_borda ||= analisar_borda_topo(all_faces_info)
        max_z_global = all_faces_info.map { |fi| fi[:max_z] }.max
        min_z_global = all_faces_info.map { |fi| fi[:center].z }.min

        faces_borda_topo = info_borda[:faces_topo] || []
        topo_faces_ids = {}
        nomes_mat_borda = {}
        faces_borda_topo.each do |fi|
          topo_faces_ids[fi[:face].object_id] = true
          nomes_mat_borda[fi[:material].name] = true if fi[:material] && !fi[:tem_textura]
          (fi[:mats] || []).each { |m| nomes_mat_borda[m.name] = true if m && m.texture.nil? }
        end

        # Filtro base: exclui apenas a laje inferior externa oculta (fundo_externo_laje) e a borda superior sem textura de revestimento.
        # NUNCA descarta faces internas legítimas por BoundingBox antes de checar o material do revestimento!
        candidatas_base = all_faces_info.reject do |fi|
          next true if fi[:fundo_externo_laje]
          if info_borda[:tem_borda]
            eh_topo = topo_faces_ids[fi[:face].object_id] || (fi[:normal].z.abs > 0.7 && (fi[:center].z >= (max_z_global - 3.5.cm)))
            next true if eh_topo && (!fi[:tem_textura] || (fi[:material] && nomes_mat_borda[fi[:material].name]))
          end
          false
        end
        candidatas_base = all_faces_info if candidatas_base.empty?

        # Se o usuário clicou em face(s) ou superfície com material (mat_forcar), seleciona todas as faces da piscina
        # que possuem esse material (na frente, no verso ou herdado — idêntico ao 'Área > Material' nativo do SketchUp!)
        if mat_forcar
          nome_alvo = mat_forcar.name.to_s
          escolhidas = candidatas_base.select do |fi|
            mats_f = fi[:mats] || [fi[:material]].compact
            mats_f.any? { |m| m == mat_forcar || m.name.to_s == nome_alvo }
          end
          return escolhidas unless escolhidas.empty?
        end

        # ESTRATÉGIA 1 (MÁXIMA PRECISÃO): Agrupamento por Material com Textura (Pastilha / Azulejo / Vinil)
        areas_por_mat_tex = {}
        candidatas_base.each do |fi|
          mats_tex = (fi[:mats] || [fi[:material]].compact).select { |m| m && m.texture != nil && !nome_material_externo?(m.name) }
          m = mats_tex.first || (fi[:material] && fi[:material].texture != nil && !nome_material_externo?(fi[:material].name) ? fi[:material] : nil)
          next unless m
          areas_por_mat_tex[m.name] = (areas_por_mat_tex[m.name] || 0.0) + fi[:area_m2]
        end

        if !areas_por_mat_tex.empty?
          candidatos_internos = areas_por_mat_tex.keys.reject { |nome| nomes_mat_borda[nome] }
          melhor_nome = if !candidatos_internos.empty?
                          candidatos_internos.max_by { |nome| areas_por_mat_tex[nome] }
                        else
                          areas_por_mat_tex.keys.max_by { |nome| areas_por_mat_tex[nome] }
                        end

          if melhor_nome && areas_por_mat_tex[melhor_nome] >= 1.5
            faces_revest = candidatas_base.select do |fi|
              mats_f = fi[:mats] || [fi[:material]].compact
              mats_f.any? { |m| m && m.name == melhor_nome }
            end
            puts "[PapaSys] ✅ Revestimento identificado por material texturizado '#{melhor_nome}' (#{faces_revest.length} faces, #{areas_por_mat_tex[melhor_nome].round(2)} m²)"
            return faces_revest
          end
        end

        # Para piscinas sem textura (cor sólida ou sem pintura), aplica o filtro de cavidade da borda plana 360°
        bb_int = info_borda[:borda_3d_plana] ? info_borda[:bb_interno] : nil
        candidatas_cavidade = candidatas_base.reject do |fi|
          next true if topo_faces_ids[fi[:face].object_id]
          next true if fi[:normal].z.abs > 0.7 && (fi[:center].z >= (max_z_global - 3.5.cm))

          if bb_int
            cx = fi[:center].x
            cy = fi[:center].y
            fora_x = cx < (bb_int.min.x - 2.5.cm) || cx > (bb_int.max.x + 2.5.cm)
            fora_y = cy < (bb_int.min.y - 2.5.cm) || cy > (bb_int.max.y + 2.5.cm)
            next true if fora_x || fora_y
          end

          false
        end
        candidatas_cavidade = candidatas_base if candidatas_cavidade.empty?

        # ESTRATÉGIA 2: Material exclusivo das faces internas (quando pintado com cor sólida sem textura)
        areas_por_mat_solido = {}
        candidatas_cavidade.each do |fi|
          m = fi[:material]
          next unless m
          next if nomes_mat_borda[m.name]
          areas_por_mat_solido[m.name] = (areas_por_mat_solido[m.name] || 0.0) + fi[:area_m2]
        end

        if !areas_por_mat_solido.empty?
          melhor_solido = areas_por_mat_solido.keys.max_by { |nome| areas_por_mat_solido[nome] }
          if melhor_solido && areas_por_mat_solido[melhor_solido] >= 2.0
            faces_revest = candidatas_cavidade.select do |fi|
              mats_f = fi[:mats] || [fi[:material]].compact
              mats_f.any? { |m| m && m.name == melhor_solido }
            end
            puts "[PapaSys] ✅ Revestimento identificado por material interno '#{melhor_solido}' (#{faces_revest.length} faces)"
            return faces_revest
          end
        end

        # ESTRATÉGIA 3: Filtro Geométrico Estrito (quando toda a piscina tem o mesmo material ou está sem pintura)
        bb_all = Geom::BoundingBox.new
        all_faces_info.each { |fi| bb_all.add(fi[:center]) }
        centro_piscina = bb_all.center

        faces_internas = []
        candidatas_cavidade.each do |fi|
          norm = fi[:normal]
          centro = fi[:center]

          # Ignora fundo externo inferior apoiado no chão
          next if norm.z < -0.6 && (centro.z - min_z_global).abs < 5.0.cm

          # Ignora paredes externas no limite do BoundingBox geral (caso não tenha caído no filtro bb_int)
          if bb_int.nil?
            no_limite_x = (centro.x - bb_all.min.x).abs < 3.0.cm || (centro.x - bb_all.max.x).abs < 3.0.cm
            no_limite_y = (centro.y - bb_all.min.y).abs < 3.0.cm || (centro.y - bb_all.max.y).abs < 3.0.cm
            next if (no_limite_x || no_limite_y) && norm.z.abs < 0.4
          end

          if norm.z > 0.6
            faces_internas << fi
            next
          end

          vec_centro = Geom::Vector3d.new(centro_piscina.x - centro.x, centro_piscina.y - centro.y, 0)
          dist_2d = vec_centro.length
          if dist_2d > 0.01
            dot = (norm.x * vec_centro.x + norm.y * vec_centro.y) / dist_2d
            faces_internas << fi if dot > 0.05
          else
            faces_internas << fi
          end
        end

        faces_internas.empty? ? candidatas_cavidade : faces_internas
      end

      # Calcula a área total líquida (m²) e os perímetros INTERNO e EXTERNO da borda superior (m linear)
      def self.calcular_quantitativos_de_revest(faces_revest, all_faces_info, bb_pos, dims, colecoes = [], info_borda = nil, largura_borda_cm_op = 20.0)
        comp_m = dims[:comprimento_m].to_f
        larg_m = dims[:largura_m].to_f

        area_m2 = faces_revest.inject(0.0) { |sum, fi| sum + fi[:area_m2] }.round(2)
        info_borda ||= analisar_borda_topo(all_faces_info)

        largura_borda_padrao_m = (largura_borda_cm_op.to_f > 0 ? (largura_borda_cm_op.to_f / 100.0) : 0.20).round(2)

        if info_borda[:tem_borda] && info_borda[:perim_interno_m] > 1.0
          borda_interna_m = info_borda[:perim_interno_m]
          largura_borda_m = info_borda[:largura_borda_m] > 0.05 ? info_borda[:largura_borda_m] : largura_borda_padrao_m

          bb_int = info_borda[:bb_interno]
          bb_ext = info_borda[:bb_externo]
          lados_iguais = false
          if bb_int && bb_ext
            b_lados = [
              (bb_int.min.x - bb_ext.min.x).to_f * 0.0254,
              (bb_ext.max.x - bb_int.max.x).to_f * 0.0254,
              (bb_int.min.y - bb_ext.min.y).to_f * 0.0254,
              (bb_ext.max.y - bb_int.max.y).to_f * 0.0254
            ]
            lados_iguais = b_lados.all? { |b| (b - largura_borda_m).abs < 0.02 }
          end

          if (lados_iguais || !info_borda[:borda_3d_plana]) && info_borda[:perim_externo_m] > (borda_interna_m + 0.15)
            borda_externa_m = info_borda[:perim_externo_m]
          else
            largura_borda_m = largura_borda_padrao_m
            borda_externa_m = (borda_interna_m + 8.0 * largura_borda_m).round(2)
          end
        else
          max_z_revest = faces_revest.map { |fi| fi[:max_z] }.max || bb_pos.max.z
          borda_interna_m = calcular_perimetro_topo(faces_revest, max_z_revest, comp_m, larg_m)
          largura_borda_m = largura_borda_padrao_m
          borda_externa_m = (borda_interna_m + 8.0 * largura_borda_m).round(2)
        end

        [area_m2, borda_interna_m, borda_externa_m, largura_borda_m]
      end

      # Calcula o perímetro INTERNO do contorno superior do revestimento da piscina
      def self.calcular_perimetro_topo(faces_revest, max_z_revest, comp_m, larg_m)
        perimetro_esperado = (2.0 * (comp_m + larg_m)).round(2)
        rev_faces_map = {}
        faces_revest.each { |fi| rev_faces_map[fi[:face]] = true }

        boundary_edges_map = {}

        faces_revest.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          next unless f.valid? && !f.deleted?
          f.edges.each do |e|
            next unless e.valid? && !e.deleted?
            next if boundary_edges_map.key?(e)
            connected = e.faces.count { |cf| cf.valid? && rev_faces_map[cf] }
            boundary_edges_map[e] = (connected == 1) ? t : nil
          end
        end

        perimetro_calculado = 0.0
        seen_midpoints = {}
        boundary_edges_map.each do |e, t|
          next unless t && e.valid?
          p1 = t * e.start.position
          p2 = t * e.end.position
          # Aresta horizontal na borda superior do revestimento (deduplicada por ponto médio 3D)
          if (p1.z - max_z_revest).abs < 8.0.cm && (p2.z - max_z_revest).abs < 8.0.cm
            mk = [((p1.x + p2.x) * 2.5).round, ((p1.y + p2.y) * 2.5).round, ((p1.z + p2.z) * 2.5).round]
            next if seen_midpoints[mk]
            seen_midpoints[mk] = true
            perimetro_calculado += (p1.distance(p2).to_f * 0.0254)
          end
        end

        if perimetro_calculado < 1.0
          perimetro_calculado = perimetro_esperado
        end

        perimetro_calculado.round(2)
      end

      # Fallback para calcular o perímetro EXTERNO da borda da piscina e a largura da borda (em metros)
      def self.calcular_perimetro_externo_borda(faces_revest, all_faces_info, bb_revest, borda_interna_m, colecoes = [], largura_borda_cm_op = 20.0)
        largura_borda_m = (largura_borda_cm_op.to_f > 0 ? (largura_borda_cm_op.to_f / 100.0) : 0.20).round(2)
        perim_ext_topo = (borda_interna_m + 8.0 * largura_borda_m).round(2)

        [perim_ext_topo, largura_borda_m]
      end

      # Calcula o BoundingBox exato das faces de revestimento (sem somar a aba externa da borda/casco)
      def self.calcular_bounds_de_faces(faces_list, colecoes_fallback = [])
        bb = Geom::BoundingBox.new
        faces_list.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          next unless f.valid? && !f.deleted?
          f.vertices.each { |v| bb.add(t * v.position) if v.valid? }
        end
        return bb unless bb.empty?

        calcular_bounds_reais(colecoes_fallback)
      end

      # Calcula o BoundingBox real diretamente a partir da posição atual dos vértices (garante leitura pós-ajuste sem cache antigo)
      def self.calcular_bounds_reais(colecoes)
        bb = Geom::BoundingBox.new
        colecoes.each do |c_info|
          t = c_info[:transform]
          c_info[:edges].each do |e|
            next unless e.valid?
            bb.add(t * e.start.position)
            bb.add(t * e.end.position)
          end
          if c_info[:edges].empty?
            c_info[:faces].each do |f|
              next unless f.valid?
              f.vertices.each { |v| bb.add(t * v.position) }
            end
          end
        end
        bb
      end

      # Define a largura padrão da borda (em polegadas) para equalizar todos os 4 lados da borda
      def self.detectar_largura_borda_padrao(xs_all, ys_all, xs_ref, ys_ref, largura_borda_cm_op = 20.0)
        return nil if xs_all.empty? || ys_all.empty? || xs_ref.empty? || ys_ref.empty?

        b_x_min = xs_ref.min - xs_all.min
        b_x_max = xs_all.max - xs_ref.max
        b_y_min = ys_ref.min - ys_all.min
        b_y_max = ys_all.max - ys_ref.max

        candidatas = [b_x_min, b_x_max, b_y_min, b_y_max].select { |b| b >= 1.0.cm && b <= 150.0.cm }
        return nil if candidatas.empty?

        if largura_borda_cm_op && largura_borda_cm_op.to_f > 0.0
          escolhida_cm = largura_borda_cm_op.to_f.round(1)
        else
          # Arredonda a média para o múltiplo comercial de 5cm mais próximo (ex: 15cm, 20cm, 25cm, 30cm)
          media_cm = (candidatas.inject(0.0, :+) / candidatas.length) * 2.54
          escolhida_cm = ((media_cm / 5.0).round * 5.0).round(1)
          escolhida_cm = 20.0 if escolhida_cm < 5.0
        end

        puts "[PapaSys] Largura de borda uniformizada nos 4 lados: #{(escolhida_cm / 100.0).round(2)}m (#{escolhida_cm}cm)"
        escolhida_cm.cm
      end

      # Cria mapa de snap 1D que:
      # 1. Ajusta APENAS as paredes internas do revestimento (valores_ref) para múltiplos exatos do módulo
      # 2. Posiciona as paredes externas da borda com largura idêntica (largura_borda_alvo) nos dois lados!
      def self.criar_mapa_snap_eixo(valores_all, zero_val, modulo, valores_ref = [], largura_borda_alvo = nil)
        return [] if valores_all.empty? || modulo <= 0.0
        valores_ref = valores_all if valores_ref.nil? || valores_ref.empty?

        # Agrupa todas as coordenadas em planos distintos (tolerância ~1mm = 0.04 polegadas)
        planos_all = []
        valores_all.sort.each do |val|
          if planos_all.empty? || (val - planos_all.last).abs > 0.04
            planos_all << val
          end
        end

        planos_ref = []
        valores_ref.sort.each do |val|
          if planos_ref.empty? || (val - planos_ref.last).abs > 0.04
            planos_ref << val
          end
        end
        planos_ref = planos_all if planos_ref.empty?

        ref_min = planos_ref.min
        ref_max = planos_ref.max
        all_min = planos_all.min
        all_max = planos_all.max

        # 1. Separa planos internos (dentro dos limites do revestimento) dos planos externos (borda / casco)
        planos_internos = planos_all.select { |u| u >= (ref_min - 0.05) && u <= (ref_max + 0.05) }
        planos_externos = planos_all.reject { |u| u >= (ref_min - 0.05) && u <= (ref_max + 0.05) }

        # Ordena planos internos do mais próximo ao ponto_zero para o mais distante
        planos_int_por_dist = planos_internos.sort_by { |u| (u - zero_val).abs }
        ajustados = []

        planos_int_por_dist.each do |u|
          eh_plano_revest = planos_ref.any? { |r| (r - u).abs <= 0.08 }

          # Preserva detalhes ultrafinos internos (< 35% do módulo)
          vizinho = ajustados.find do |item|
            ((u - zero_val) * (item[:orig] - zero_val) >= -0.001) && (u - item[:orig]).abs < (modulo * 0.35)
          end

          if vizinho && !eh_plano_revest
            shift = vizinho[:shift]
            ajustados << { orig: u, novo: u + shift, shift: shift }
          else
            delta = u - zero_val
            if delta.abs < 0.001
              novo_delta = 0.0
            else
              n = (delta / modulo).round
              n = (delta > 0 ? 1 : -1) if n == 0 && delta.abs > (modulo * 0.25)
              novo_delta = n * modulo
            end
            shift = novo_delta - delta
            ajustados << { orig: u, novo: zero_val + novo_delta, shift: shift }
          end
        end

        # Determina a posição pós-ajuste das paredes internas extremas (ref_min e ref_max)
        item_min = ajustados.min_by { |a| (a[:orig] - ref_min).abs }
        item_max = ajustados.min_by { |a| (a[:orig] - ref_max).abs }

        novo_ref_min = item_min ? item_min[:novo] : ref_min
        novo_ref_max = item_max ? item_max[:novo] : ref_max
        shift_min = novo_ref_min - ref_min
        shift_max = novo_ref_max - ref_max

        # 2. Ajusta os planos externos (borda superior e casco externo) mantendo a mesma largura de borda nos dois lados!
        planos_externos.each do |u|
          if u < ref_min
            borda_orig_min = ref_min - all_min
            if largura_borda_alvo && largura_borda_alvo > 0.0 && borda_orig_min > 0.04
              dist_orig = ref_min - u
              dist_nova = dist_orig * (largura_borda_alvo / borda_orig_min)
              novo_u = novo_ref_min - dist_nova
              ajustados << { orig: u, novo: novo_u, shift: novo_u - u }
            else
              ajustados << { orig: u, novo: u + shift_min, shift: shift_min }
            end
          else
            borda_orig_max = all_max - ref_max
            if largura_borda_alvo && largura_borda_alvo > 0.0 && borda_orig_max > 0.04
              dist_orig = u - ref_max
              dist_nova = dist_orig * (largura_borda_alvo / borda_orig_max)
              novo_u = novo_ref_max + dist_nova
              ajustados << { orig: u, novo: novo_u, shift: novo_u - u }
            else
              ajustados << { orig: u, novo: u + shift_max, shift: shift_max }
            end
          end
        end

        ajustados
      end

      def self.aplicar_snap_eixo(val, mapa)
        return val if mapa.empty?
        item = mapa.min_by { |m| (m[:orig] - val).abs }
        item ? (val + item[:shift]) : val
      end

      # Coleta todas as entidades (faces, arestas e sub-grupos) de um grupo aberto para edição (modelo.active_path)
      def self.coletar_contexto_aberto(modelo, contador = [0], limite = 25000)
        colecoes = []
        ents = modelo.active_entities rescue nil
        return colecoes unless ents

        mat_contexto = nil
        if modelo.active_path && !modelo.active_path.empty?
          modelo.active_path.each do |inst|
            m_inst = (inst.respond_to?(:material) ? inst.material : nil) rescue nil
            mat_contexto = m_inst if m_inst
          end
        end

        faces_diretas = []
        edges_diretas = []
        sub_grupos = []
        sub_comps = []

        ents.each do |e|
          next unless e.valid? && !e.deleted?
          if e.is_a?(Sketchup::Face)
            faces_diretas << e
            contador[0] += 1
          elsif e.is_a?(Sketchup::Edge)
            edges_diretas << e
            contador[0] += 1
          elsif e.is_a?(Sketchup::Group)
            sub_grupos << e
          elsif e.is_a?(Sketchup::ComponentInstance)
            sub_comps << e
          end
          break if contador[0] >= limite
        end

        if !faces_diretas.empty? || !edges_diretas.empty?
          colecoes << {
            owner: (modelo.active_path.last rescue modelo),
            entities: ents,
            transform: Geom::Transformation.new,
            inherited_mat: mat_contexto,
            faces: faces_diretas,
            edges: edges_diretas
          }
        end

        sub_grupos.each do |sg|
          break if contador[0] >= limite
          mat_sg = (sg.respond_to?(:material) && sg.material) ? sg.material : mat_contexto
          colecoes.concat(coletar_sub_entidades(sg, sg.transformation, contador, limite, mat_sg))
        end

        sub_comps.each do |sc|
          break if contador[0] >= limite
          mat_sc = (sc.respond_to?(:material) && sc.material) ? sc.material : mat_contexto
          colecoes.concat(coletar_sub_entidades(sc, sc.transformation, contador, limite, mat_sc))
        end

        colecoes
      end

      # Coleta recursivamente todas as coleções de entidades com limite de segurança
      def self.coletar_sub_entidades(entidade, transform_acumulada = Geom::Transformation.new, contador = [0], limite = 25000, inherited_mat = nil)
        colecoes = []
        return colecoes if contador[0] >= limite

        ents = entidade.is_a?(Sketchup::Group) ? entidade.entities : (entidade.respond_to?(:definition) ? entidade.definition.entities : nil)
        return colecoes unless ents

        mat_atual = (entidade.respond_to?(:material) && entidade.material) ? entidade.material : inherited_mat

        faces_diretas = []
        edges_diretas = []
        sub_grupos = []
        sub_comps = []

        ents.each do |e|
          next unless e.valid? && !e.deleted?
          if e.is_a?(Sketchup::Face)
            faces_diretas << e
            contador[0] += 1
          elsif e.is_a?(Sketchup::Edge)
            edges_diretas << e
            contador[0] += 1
          elsif e.is_a?(Sketchup::Group)
            sub_grupos << e
          elsif e.is_a?(Sketchup::ComponentInstance)
            sub_comps << e
          end
          break if contador[0] >= limite
        end

        if !faces_diretas.empty? || !edges_diretas.empty?
          colecoes << {
            owner: entidade,
            entities: ents,
            transform: transform_acumulada,
            inherited_mat: mat_atual,
            faces: faces_diretas,
            edges: edges_diretas
          }
        end

        return colecoes if contador[0] >= limite

        sub_grupos.each do |sg|
          break if contador[0] >= limite
          sub_t = transform_acumulada * sg.transformation
          mat_sg = (sg.respond_to?(:material) && sg.material) ? sg.material : mat_atual
          colecoes.concat(coletar_sub_entidades(sg, sub_t, contador, limite, mat_sg))
        end

        sub_comps.each do |sc|
          break if contador[0] >= limite
          sub_t = transform_acumulada * sc.transformation
          mat_sc = (sc.respond_to?(:material) && sc.material) ? sc.material : mat_atual
          colecoes.concat(coletar_sub_entidades(sc, sub_t, contador, limite, mat_sc))
        end

        colecoes
      end

      # Obtém os bounds locais com suporte nativo a Groups e ComponentInstances
      def self.obter_bounds_locais(entidade)
        if entidade.respond_to?(:definition) && entidade.definition.respond_to?(:bounds)
          entidade.definition.bounds
        elsif entidade.respond_to?(:local_bounds)
          entidade.local_bounds
        else
          entidade.bounds
        end
      end

      # Calcula o ponto de referência (centro ou um dos 4 cantos da borda)
      def self.calcular_ponto_zero(bb, origem, canto_ref)
        if origem == 'canto'
          case canto_ref.to_s.downcase
          when 'sup_esq'
            Geom::Point3d.new(bb.min.x, bb.max.y, bb.max.z)
          when 'sup_dir'
            Geom::Point3d.new(bb.max.x, bb.max.y, bb.max.z)
          when 'inf_dir'
            Geom::Point3d.new(bb.max.x, bb.min.y, bb.max.z)
          else # 'inf_esq' (padrão)
            Geom::Point3d.new(bb.min.x, bb.min.y, bb.max.z)
          end
        else
          bb.center
        end
      end

      # ==============================================================================
      # MOTOR DE QUANTITATIVOS iGUi (SEÇÕES 7 E 8)
      # ==============================================================================

      # Identifica faces por material (Revestimento vs Laminação)
      # Calcula área revestimento, área laminação, volume em m³ e litros,
      # detecta cantos lineares e quinas vivas, e calcula acabamentos.
      def self.calcular_quantitativos_igui(faces_revest_detectadas, all_faces_info, bb_pos, dims, options = {})
        revestimento_sel = (options[:revestimento] || options['revestimento'] || 'pastilha_15x15').to_s

        faces_revest = []
        faces_lamina = []

        # Classificação geométrica estrita (determina as faces reais de revestimento e laminação)
        geom = classificar_faces_geometricamente(all_faces_info)

        # 1. Revestimento interno (35,81 m² nas 9 faces):
        area_pre_revest = faces_revest_detectadas ? faces_revest_detectadas.map { |fi| fi[:area_m2].to_f }.inject(0.0, :+) : 0.0
        if faces_revest_detectadas && !faces_revest_detectadas.empty? && area_pre_revest >= 0.5
          faces_revest = faces_revest_detectadas
        else
          faces_revest = geom[:faces_revest]
        end

        # Se ainda assim faces_revest estiver vazio, força a classificação geométrica
        if faces_revest.empty? && !all_faces_info.empty?
          faces_revest = geom[:faces_revest]
        end

        # 2. Laminação externa + borda (40,15 m²):
        # A laminação é SEMPRE calculada pela casca externa + borda geométrica,
        # rejeitando apenas as faces que pertençam ao revestimento interno.
        rev_ids = {}
        faces_revest.each { |fi| rev_ids[fi[:face].object_id] = true }
        faces_lamina = geom[:faces_lamina].reject { |fi| rev_ids[fi[:face].object_id] }

        # Áreas (m²)
        area_revest_m2 = faces_revest.map { |fi| fi[:area_m2].to_f }.inject(0.0, :+).round(2)
        area_lamina_m2 = faces_lamina.map { |fi| fi[:area_m2].to_f }.inject(0.0, :+).round(2)

        # Se a piscina foi desenhada como casca única/sólida (onde as paredes internas representam o casco),
        # a laminação de fábrica cobre todo o casco da piscina (área interna) + a borda superior (ex: 35,81 + 4,34 = 40,15 m²):
        if area_lamina_m2 < area_revest_m2
          area_lamina_m2 = (area_revest_m2 + area_lamina_m2).round(2)
        end

        has_explicit_revest = faces_revest.any? { |fi| fi[:tem_textura] || (fi[:material] && (fi[:material].name.to_s.downcase.include?('revestimento') || fi[:material].name.to_s.downcase.include?('pastilha') || fi[:material].name.to_s.downcase.include?('azulejo') || fi[:material].name.to_s.downcase.include?('azul'))) }
        has_explicit_lamina = faces_lamina.any? { |fi| fi[:material] && cor_material_laminacao?(fi[:material]) } ||
                              all_faces_info.any? { |fi| fi[:material] && cor_material_laminacao?(fi[:material]) }

        # Volume Interno (m³ e Litros)
        vol_info = calcular_volume_interno(faces_revest, bb_pos, dims)

        # Cantos lineares e Quinas vivas
        cantos_info = detectar_cantos_e_quinas(faces_revest, dims)

        # Peças de Acabamento (Seção 7)
        acabamentos = calcular_pecas_acabamento(revestimento_sel, cantos_info[:comprimento_cm], cantos_info[:quinas_vivas])

        {
          revestimento_selecionado: revestimento_sel,
          has_explicit_revest: has_explicit_revest,
          has_explicit_lamina: has_explicit_lamina,
          area_revestimento_m2: area_revest_m2,
          area_laminacao_m2: area_lamina_m2,
          volume_m3: vol_info[:m3],
          volume_litros: vol_info[:litros],
          cantos_lineares_m: cantos_info[:comprimento_m],
          cantos_lineares_cm: cantos_info[:comprimento_cm],
          quinas_vivas_count: cantos_info[:quinas_vivas],
          acabamentos: acabamentos
        }
      end

      # Volume interno exato e em litros
      def self.calcular_volume_interno(faces_revest, bb_pos, dims)
        return { m3: 0.0, litros: 0 } if faces_revest.empty?

        max_z = faces_revest.map { |fi| fi[:max_z] }.max || 0.0
        vol_m3_acumulado = 0.0

        # Para cada superfície horizontal interna (fundo e pisos dos degraus/prainha):
        # O volume sobre ela é a área projetada multiplicada pela altura da coluna d'água até max_z.
        faces_revest.each do |fi|
          norm_z = fi[:normal].z.abs
          next if norm_z < 0.2 # Paredes verticais não sustentam coluna de água
          next if fi[:center].z >= (max_z - 4.0.cm) # Ignora borda superior se houver

          alt_coluna_m = [(max_z - fi[:center].z) * 0.0254, 0.0].max
          area_proj_m2 = fi[:area_m2].to_f * norm_z
          vol_m3_acumulado += (area_proj_m2 * alt_coluna_m)
        end

        # Fallback de aproximação se malha for casca aberta
        if vol_m3_acumulado < 0.2
          comp = dims[:comprimento_m].to_f
          larg = dims[:largura_m].to_f
          prof = dims[:profundidade_m].to_f
          prof = 1.40 if prof <= 0.1
          vol_m3_acumulado = comp * larg * prof * 0.88
        end

        m3 = vol_m3_acumulado.round(2)
        litros = (m3 * 1000.0).round(0).to_i
        { m3: m3, litros: litros }
      end

      # Detecção precisa de cantos lineares (arestas salientes de degraus/bancos onde vai BP11 / Boleado Reto)
      # e quinas vivas (encontro de arestas salientes formando canto vivo onde vai C3 / Quebra-canto)
      def self.detectar_cantos_e_quinas(faces_revest, dims)
        bb_revest = Geom::BoundingBox.new
        faces_revest.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          next unless f && f.valid? && !f.deleted?
          f.vertices.each { |v| bb_revest.add(t * v.position) if v.valid? }
        end

        edge_map = {}
        faces_revest.each do |fi|
          f = fi[:face]
          t = fi[:transform] || Geom::Transformation.new
          f.edges.each do |e|
            next unless e.valid? && !e.deleted?
            edge_map[e.object_id] ||= { edge: e, transform: t, faces: [] }
            edge_map[e.object_id][:faces] << fi
          end
        end

        cantos_lineares = []
        cantos_para_quinas = []
        comprimento_total_cm = 0.0

        edge_map.values.each do |e_info|
          faces = e_info[:faces]
          next unless faces.length == 2

          f1 = faces[0]
          f2 = faces[1]

          is_horiz1 = f1[:normal].z.abs > 0.4
          is_horiz2 = f2[:normal].z.abs > 0.4
          is_vert1 = f1[:normal].z.abs < 0.3
          is_vert2 = f2[:normal].z.abs < 0.3
          face_vertical = nil

          e = e_info[:edge]
          t = e_info[:transform]
          p1 = t * e.start.position
          p2 = t * e.end.position
          p_mid_z = (p1.z + p2.z) / 2.0

          # Aresta de canto linear (onde vai Boleada / Cantoneira) é ESTRITAMENTE HORIZONTAL (degraus/prainha/bancos)
          next if (p1.z - p2.z).abs > 2.0.cm

          is_convex = false

          # Encontro de degrau/prainha/banco (uma face horizontal e uma vertical):
          # A face vertical DEVE estar ABAIXO da aresta para ser degrau/quina saliente onde vai a pastilha boleada
          if is_horiz1 && is_vert2
            is_convex = (p_mid_z - f2[:center].z) > 1.0.cm
            face_vertical = f2 if is_convex
          elsif is_horiz2 && is_vert1
            is_convex = (p_mid_z - f1[:center].z) > 1.0.cm
            face_vertical = f1 if is_convex
          end

          next unless is_convex

          edge_len_m = (p1.distance(p2).to_f * 0.0254).round(3)
          edge_len_cm = (edge_len_m * 100.0).round(1)

          canto_info = {
            edge: e,
            len_m: edge_len_m,
            len_cm: edge_len_cm,
            p1: p1,
            p2: p2,
            vetor: p1.vector_to(p2),
            face_vertical: face_vertical
          }

          cantos_para_quinas << canto_info
          next unless aresta_contabilizavel_como_linear?(p1, p2, bb_revest)

          cantos_lineares << canto_info
          comprimento_total_cm += edge_len_cm
        end

        # Contagem de quinas vivas (vértices onde 2 ou mais cantos convexos se encontram,
        # como o canto vivo do degrau destacado no print do usuário). Pontas que encostam
        # no contorno interno da piscina são terminações contra parede, não quebra-canto.
        cantos_por_vertice = {}
        cantos_para_quinas.each do |c|
          # Chaves de vértice discretizadas em 1cm para coincidir vértices compartilhados
          k1 = "#{(c[:p1].x * 2.54).round(0)}_#{(c[:p1].y * 2.54).round(0)}_#{(c[:p1].z * 2.54).round(0)}"
          k2 = "#{(c[:p2].x * 2.54).round(0)}_#{(c[:p2].y * 2.54).round(0)}_#{(c[:p2].z * 2.54).round(0)}"
          cantos_por_vertice[k1] ||= []
          cantos_por_vertice[k1] << c.merge(ponto: c[:p1])
          cantos_por_vertice[k2] ||= []
          cantos_por_vertice[k2] << c.merge(ponto: c[:p2])
        end

        quinas_vivas = cantos_por_vertice.values.count do |cantos_no_vertice|
          next false if cantos_no_vertice.length < 2

          pt = cantos_no_vertice.first[:ponto]
          next false if ponto_no_limite_interno?(pt, bb_revest, 3.0.cm)

          # Só existe peça de quina quando duas bordas lineares se encontram em L.
          # Bordas colineares ou quase colineares são uma continuidade da mesma peça.
          tem_encontro_em_l = false
          cantos_no_vertice.combination(2) do |a, b|
            va = vetor_saida_do_vertice(a, pt)
            vb = vetor_saida_do_vertice(b, pt)
            next if va.length <= 0.001 || vb.length <= 0.001
            ang = va.angle_between(vb) rescue 0.0
            if ang > 35.degrees && ang < 145.degrees
              tem_encontro_em_l = true
              break
            end
          end

          tem_encontro_em_l
        end

        {
          comprimento_m: (comprimento_total_cm / 100.0).round(2),
          comprimento_cm: comprimento_total_cm.round(1),
          quinas_vivas: quinas_vivas
        }
      end

      def self.ponto_no_limite_interno?(pt, bb, tolerancia)
        return false if !pt || !bb || bb.empty?

        (pt.x - bb.min.x).abs <= tolerancia ||
          (pt.x - bb.max.x).abs <= tolerancia ||
          (pt.y - bb.min.y).abs <= tolerancia ||
          (pt.y - bb.max.y).abs <= tolerancia
      end

      def self.aresta_contabilizavel_como_linear?(p1, p2, bb)
        return true if !p1 || !p2 || !bb || bb.empty?

        dx = (p2.x - p1.x).abs
        dy = (p2.y - p1.y).abs
        return false if dx < 0.001 && dy < 0.001

        comprimento_m = (p1.distance(p2).to_f * 0.0254)
        menor_lado_m = ([bb.width.to_f, bb.height.to_f].min * 0.0254)
        tolerancia_limite = 3.0.cm

        # Os cantos lineares iGUi são as frentes dos degraus/bancos/prainhas.
        # Em piscinas retas, essas frentes cruzam a largura menor da piscina.
        if bb.width.to_f >= bb.height.to_f
          return true if dy >= dx
        else
          return true if dx >= dy
        end

        # Retornos curtos internos também recebem acabamento linear quando estão
        # destacados dentro da piscina, como a lateral curta do banco/degrau central.
        # Retornos no limite do tanque são terminações contra parede e ficam fora.
        return false if ponto_no_limite_interno?(p1, bb, tolerancia_limite) || ponto_no_limite_interno?(p2, bb, tolerancia_limite)

        comprimento_m <= (menor_lado_m * 0.35)
      end

      def self.vetor_saida_do_vertice(canto, pt)
        p1 = canto[:p1]
        p2 = canto[:p2]
        if pt.distance(p1) <= pt.distance(p2)
          p1.vector_to(p2)
        else
          p2.vector_to(p1)
        end
      end

      # Cálculo exato das peças de acabamento conforme a tabela da Seção 7
      def self.calcular_pecas_acabamento(revestimento, comprimento_cantos_cm, quinas_vivas)
        rev = revestimento.to_s.downcase.strip

        case rev
        when 'pastilha_5x5', 'pastilha_10x10'
          # Cantoneira BP11 (20 cm cada) -> arredondar para cima (comprimento ÷ 20 cm)
          # 1 C3 por quina viva
          qtd_bp11 = (comprimento_cantos_cm.to_f / 20.0).ceil
          qtd_c3 = quinas_vivas.to_i * 1
          {
            tipo_regra: 'bp11_c3',
            is_custom: false,
            peca_linear_nome: 'Cantoneira BP11 (20cm)',
            peca_linear_qtd: qtd_bp11,
            peca_linear_unidade: 'un',
            peca_linear_preco_unit: 18.50,
            peca_quina_nome: 'Peça C3',
            peca_quina_qtd: qtd_c3,
            peca_quina_unidade: 'un',
            peca_quina_preco_unit: 14.00,
            observacao: "#{qtd_bp11} un BP11 + #{qtd_c3} un C3"
          }
        when 'pastilha_7_5x7_5'
          # Pastilha boleada reta 7,5cm -> arredondar para cima (comprimento ÷ 7,5 cm)
          # 1 quebra-canto por quina viva
          qtd_boleada = (comprimento_cantos_cm.to_f / 7.5).ceil
          qtd_quebra_canto = quinas_vivas.to_i * 1
          {
            tipo_regra: 'boleada_7_5',
            is_custom: false,
            peca_linear_nome: 'Boleada Reta 7,5x7,5cm',
            peca_linear_qtd: qtd_boleada,
            peca_linear_unidade: 'un',
            peca_linear_preco_unit: 8.50,
            peca_quina_nome: 'Quebra-canto',
            peca_quina_qtd: qtd_quebra_canto,
            peca_quina_unidade: 'un',
            peca_quina_preco_unit: 15.00,
            observacao: "#{qtd_boleada} un Boleada 7,5cm + #{qtd_quebra_canto} un Quebra-canto"
          }
        when 'pastilha_15x15'
          # Pastilha boleada reta 15cm -> arredondar para cima (comprimento ÷ 15 cm)
          # 1 quebra-canto por quina viva
          qtd_boleada = (comprimento_cantos_cm.to_f / 15.0).ceil
          qtd_quebra_canto = quinas_vivas.to_i * 1
          {
            tipo_regra: 'boleada_15',
            is_custom: false,
            peca_linear_nome: 'Boleada Reta 15x15cm',
            peca_linear_qtd: qtd_boleada,
            peca_linear_unidade: 'un',
            peca_linear_preco_unit: 12.00,
            peca_quina_nome: 'Quebra-canto',
            peca_quina_qtd: qtd_quebra_canto,
            peca_quina_unidade: 'un',
            peca_quina_preco_unit: 15.00,
            observacao: "#{qtd_boleada} un Boleada 15cm + #{qtd_quebra_canto} un Quebra-canto"
          }
        when 'porcelanato_villagres', 'personalizado'
          # Informar metragem total dos cantos lineares e quantidade de quinas vivas
          # Marcado como "Revestimento personalizado – definido posteriormente pelo cliente", sem calcular peças
          {
            tipo_regra: 'personalizado',
            is_custom: true,
            peca_linear_nome: 'Cantos lineares informados',
            peca_linear_qtd: (comprimento_cantos_cm.to_f / 100.0).round(2),
            peca_linear_unidade: 'm',
            peca_linear_preco_unit: 0.00,
            peca_quina_nome: 'Quinas vivas informadas',
            peca_quina_qtd: quinas_vivas.to_i,
            peca_quina_unidade: 'un',
            peca_quina_preco_unit: 0.00,
            observacao: 'Revestimento personalizado – definido posteriormente pelo cliente'
          }
        else
          # Fallback
          qtd_bp11 = (comprimento_cantos_cm.to_f / 20.0).ceil
          {
            tipo_regra: 'bp11_c3',
            is_custom: false,
            peca_linear_nome: 'Cantoneira BP11',
            peca_linear_qtd: qtd_bp11,
            peca_linear_unidade: 'un',
            peca_linear_preco_unit: 18.50,
            peca_quina_nome: 'Peça C3',
            peca_quina_qtd: quinas_vivas.to_i,
            peca_quina_unidade: 'un',
            peca_quina_preco_unit: 14.00,
            observacao: "#{qtd_bp11} un BP11 + #{quinas_vivas} un C3"
          }
        end
      end

      # Utilitário: Pinta TODO o componente/grupo da piscina de cinza (Laminação iGUi)
      def self.aplicar_laminacao_total
        modelo = Sketchup.active_model
        return { success: false, error: 'Nenhum modelo aberto' } unless modelo

        mats = modelo.materials
        mat_lam = mats['Laminação'] || mats['Laminacao'] || mats.add('Laminação')
        mat_lam.color = Sketchup::Color.new(115, 115, 115) # Cinza escuro laminação iGUi

        selecao = modelo.selection
        tem_contexto_aberto = (modelo.active_path && !modelo.active_path.empty?) rescue false

        if selecao.empty? && !tem_contexto_aberto
          return { success: false, error: 'Selecione a piscina no SketchUp para aplicar a laminação.' }
        end

        modelo.start_operation('Aplicar Laminação Total', true)

        count_faces = 0
        if tem_contexto_aberto
          modelo.active_entities.grep(Sketchup::Face).each do |f|
            next unless f.valid?
            f.material = mat_lam
            f.back_material = mat_lam rescue nil
            count_faces += 1
          end
        else
          selecao.each do |ent|
            ent.material = mat_lam if ent.respond_to?(:material=)
            if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
              entities = ent.is_a?(Sketchup::Group) ? ent.entities : ent.definition.entities
              entities.grep(Sketchup::Face).each do |f|
                next unless f.valid?
                f.material = mat_lam
                f.back_material = mat_lam rescue nil
                count_faces += 1
              end
            elsif ent.is_a?(Sketchup::Face)
              ent.material = mat_lam
              ent.back_material = mat_lam rescue nil
              count_faces += 1
            end
          end
        end

        modelo.commit_operation
        modelo.active_view.invalidate rescue nil

        {
          success: true,
          message: "Laminação cinza aplicada em todo o componente com sucesso (#{count_faces} faces)!"
        }
      rescue => e
        modelo.abort_operation rescue nil
        { success: false, error: "Falha ao aplicar laminação: #{e.message}" }
      end

      # Mantém compatibilidade com chamadas antigas
      def self.aplicar_materiais_padrao_igui
        aplicar_laminacao_total
      end

      # Utilitário: Seleciona no SketchUp todas as faces de laminação do modelo
      def self.selecionar_faces_laminacao_3d
        modelo = Sketchup.active_model
        return { success: false, error: 'Nenhum modelo aberto' } unless modelo

        tem_contexto_aberto = (modelo.active_path && !modelo.active_path.empty?) rescue false
        colecoes = []
        if tem_contexto_aberto
          colecoes = coletar_contexto_aberto(modelo)
        else
          selecao = modelo.selection
          selecao.each do |ent|
            if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
              t_raiz = ent.transformation rescue Geom::Transformation.new
              sub_cols = coletar_sub_entidades(ent, t_raiz, [0], 25000, (ent.material rescue nil))
              colecoes.concat(sub_cols)
            elsif ent.is_a?(Sketchup::Face)
              colecoes << {
                owner: modelo,
                entities: modelo.active_entities,
                transform: Geom::Transformation.new,
                inherited_mat: nil,
                faces: [ent],
                edges: ent.edges
              }
            end
          end
        end

        all_faces_info = extrair_faces_info(colecoes)
        return { success: false, error: 'Nenhuma face encontrada.' } if all_faces_info.empty?

        geom = classificar_faces_geometricamente(all_faces_info)
        area_geom_lam = geom[:faces_lamina].map { |fi| fi[:area_m2] }.inject(0.0, :+).round(2)
        faces_para_sel = (area_geom_lam < 10.0 && !all_faces_info.empty?) ? all_faces_info : geom[:faces_lamina]

        sel = modelo.selection
        sel.clear
        faces_para_sel.each { |fi| sel.add(fi[:face]) if fi[:face].valid? }

        area = faces_para_sel.map { |fi| fi[:area_m2] }.inject(0.0, :+).round(2)
        {
          success: true,
          message: "#{faces_para_sel.length} faces de Laminação selecionadas no SketchUp (#{area} m²).",
          area_m2: area,
          faces_count: faces_para_sel.length
        }
      end

      # Utilitário: Seleciona no SketchUp todas as faces de revestimento interno
      def self.selecionar_faces_revestimento_3d
        modelo = Sketchup.active_model
        return { success: false, error: 'Nenhum modelo aberto' } unless modelo

        tem_contexto_aberto = (modelo.active_path && !modelo.active_path.empty?) rescue false
        colecoes = []
        if tem_contexto_aberto
          colecoes = coletar_contexto_aberto(modelo)
        else
          selecao = modelo.selection
          selecao.each do |ent|
            if ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
              t_raiz = ent.transformation rescue Geom::Transformation.new
              sub_cols = coletar_sub_entidades(ent, t_raiz, [0], 25000, (ent.material rescue nil))
              colecoes.concat(sub_cols)
            elsif ent.is_a?(Sketchup::Face)
              colecoes << {
                owner: modelo,
                entities: modelo.active_entities,
                transform: Geom::Transformation.new,
                inherited_mat: nil,
                faces: [ent],
                edges: ent.edges
              }
            end
          end
        end

        all_faces_info = extrair_faces_info(colecoes)
        return { success: false, error: 'Nenhuma face encontrada.' } if all_faces_info.empty?

        geom = classificar_faces_geometricamente(all_faces_info)
        faces_para_sel = geom[:faces_revest]

        sel = modelo.selection
        sel.clear
        faces_para_sel.each { |fi| sel.add(fi[:face]) if fi[:face].valid? }

        area = faces_para_sel.map { |fi| fi[:area_m2] }.inject(0.0, :+).round(2)
        {
          success: true,
          message: "#{faces_para_sel.length} faces de Revestimento selecionadas no SketchUp (#{area} m²).",
          area_m2: area,
          faces_count: faces_para_sel.length
        }
      end
    end
  end
end
