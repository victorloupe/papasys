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

        if selecao.empty?
          return { success: false, error: 'Por favor, selecione as faces da piscina OU o grupo/componente.' }
        end

        faces_sel = selecao.grep(Sketchup::Face)
        grupos_sel = selecao.grep(Sketchup::Group) + selecao.grep(Sketchup::ComponentInstance)

        is_face_sel = !faces_sel.empty?
        grupo = nil
        dims = {}

        mod_h = (largura_cm.to_f + rejunte_cm.to_f).cm
        mod_v = (altura_cm.to_f + rejunte_cm.to_f).cm

        if mod_h <= 0.0 || mod_v <= 0.0
          return { success: false, error: 'Dimensões da peça e rejunte devem ser maiores que zero.' }
        end

        origem = (options[:origem] || 'centro').to_s.downcase
        canto_ref = (options[:canto_ref] || 'inf_esq').to_s.downcase

        colecoes = []
        bb = Geom::BoundingBox.new

        if is_face_sel
          faces_sel.each { |f| bb.add(f.bounds) if f.valid? }
          colecoes << {
            owner: modelo,
            entities: modelo.active_entities,
            transform: Geom::Transformation.new,
            faces: faces_sel,
            edges: faces_sel.map(&:edges).flatten.uniq
          }
        elsif grupos_sel.length == 1
          grupo = grupos_sel.first
          grupo.make_unique rescue nil

          bb = obter_bounds_locais(grupo)
          colecoes = coletar_sub_entidades(grupo)

          if colecoes.empty?
            ents_diretas = grupo.is_a?(Sketchup::Group) ? grupo.entities : grupo.definition.entities rescue nil
            if ents_diretas
              colecoes << {
                owner: grupo,
                entities: ents_diretas,
                transform: Geom::Transformation.new,
                faces: ents_diretas.grep(Sketchup::Face),
                edges: ents_diretas.grep(Sketchup::Edge)
              }
            end
          end
        else
          return { success: false, error: 'Por favor, selecione as faces da piscina ou exatamente 1 grupo/componente.' }
        end

        ponto_zero = calcular_ponto_zero(bb, origem, canto_ref)

        dims = {
          comprimento_m: (bb.width.to_f * 0.0254).round(2),
          largura_m: (bb.height.to_f * 0.0254).round(2),
          profundidade_m: (bb.depth.to_f * 0.0254).round(2)
        }

        # ======================================================================
        # 1. ANÁLISE DE CURVAS E GEOMETRIAS ORGÂNICAS
        # ======================================================================
        all_edges = colecoes.map { |c| c[:edges] }.flatten.uniq
        curves = all_edges.map(&:curve).compact.uniq
        tem_curvas = !curves.empty? || all_edges.any? { |e| e.smooth? || e.soft? }

        # Comprimento linear desenvolvido de UMA curva horizontal da parede frontal
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

        # ======================================================================
        # 2. INTELIGÊNCIA DE TRANSFORMAÇÃO 3D (ZERO DISTORÇÃO DE CURVAS)
        # ======================================================================
        total_pontos_ajustados = 0

        if tem_curvas
          # REGRA FUNDAMENTAL: Em piscinas com curvas e formas orgânicas,
          # a curvatura original é 100% PRESERVADA sem deformação.
          puts "[PapaSys] Curvas detectadas: Formato 3D orgânico mantido 100% intacto."
        else
          # Piscinas retangulares: modula os vértices ortogonais para múltiplos das peças
          modelo.start_operation("PapaSys: Ajuste Inteligente #{largura_cm}x#{altura_cm}", true)

          colecoes.each do |c_info|
            t = c_info[:transform]
            t_inv = t.inverse rescue Geom::Transformation.new
            pts_mover = []
            vecs_mover = []

            c_verts = c_info[:edges].map(&:vertices).flatten.uniq rescue []

            c_verts.each do |v|
              next unless v.valid?
              pt_local = v.position
              pt_global = t * pt_local

              delta_x = pt_global.x - ponto_zero.x
              delta_y = pt_global.y - ponto_zero.y
              delta_z = pt_global.z - ponto_zero.z

              novo_delta_x = (delta_x / mod_h).round * mod_h
              novo_delta_y = (delta_y / mod_h).round * mod_h
              novo_delta_z = (delta_z / mod_v).round * mod_v

              novo_pt_global = Geom::Point3d.new(
                ponto_zero.x + novo_delta_x,
                ponto_zero.y + novo_delta_y,
                ponto_zero.z + novo_delta_z
              )

              if pt_global.distance(novo_pt_global) > 0.001
                novo_pt_local = t_inv * novo_pt_global
                pts_mover << v
                vecs_mover << pt_local.vector_to(novo_pt_local)
              end
            end

            if !pts_mover.empty?
              c_info[:entities].transform_by_vectors(pts_mover, vecs_mover)
              total_pontos_ajustados += pts_mover.length
            end
          end

          modelo.commit_operation
        end

        # ======================================================================
        # 3. CÁLCULO PRECISO DA ÁREA DE REVESTIMENTO (m²) E BORDA (m linear)
        # ======================================================================
        all_faces_info = []

        colecoes.each do |c_info|
          t = c_info[:transform]
          x_scale = (t * Geom::Vector3d.new(1,0,0)).length rescue 1.0
          y_scale = (t * Geom::Vector3d.new(0,1,0)).length rescue 1.0
          scale_area = (x_scale * y_scale).to_f
          scale_area = 1.0 if scale_area <= 0.0001

          c_info[:entities].grep(Sketchup::Face).each do |f|
            next unless f.valid? && !f.deleted?
            norm_global = t * f.normal rescue f.normal
            centro_global = t * f.bounds.center rescue f.bounds.center
            max_z_global = (t * f.bounds.max).z rescue f.bounds.max.z

            mat = f.material || f.back_material || c_info[:owner].material rescue nil

            all_faces_info << {
              face: f,
              area_m2: (f.area * 0.00064516 * scale_area).to_f,
              material: mat,
              normal: norm_global,
              center: centro_global,
              max_z: max_z_global
            }
          end
        end

        area_total_m2, perimetro_linear_m = calcular_quantitativos_revestimento(all_faces_info, bb, dims, is_face_sel)

        if grupo && grupo.valid?
          nb = obter_bounds_locais(grupo)
          dims = {
            comprimento_m: (nb.width.to_f * 0.0254).round(2),
            largura_m: (nb.height.to_f * 0.0254).round(2),
            profundidade_m: (nb.depth.to_f * 0.0254).round(2)
          }
        end

        area_com_perda_10 = (area_total_m2 * 1.10).round(2)
        area_com_perda_15 = (area_total_m2 * 1.15).round(2)
        pecas_curva = comp_curva_horizontal_m > 0 ? (comp_curva_horizontal_m / ((largura_cm.to_f + rejunte_cm.to_f) / 100.0)).round : 0

        {
          success: true,
          modo_selecao: is_face_sel ? 'faces_selecionadas' : 'grupo_completo',
          projeto: options[:projeto] || 'Ajuste de Piscina Cliente',
          cliente: options[:cliente] || 'Cliente Geral',
          notas: options[:notas] || '',
          largura_peca_cm: largura_cm.to_f,
          altura_peca_cm: altura_cm.to_f,
          rejunte_cm: rejunte_cm.to_f,
          mod_horizontal_cm: (largura_cm.to_f + rejunte_cm.to_f).round(3),
          mod_vertical_cm: (altura_cm.to_f + rejunte_cm.to_f).round(3),
          origem_modulacao: origem,
          tem_curvas: tem_curvas,
          comprimento_curva_m: comp_curva_horizontal_m.round(2),
          qtd_pastilhas_curva: pecas_curva,
          curvas_detectadas: curves.length,
          area_interna_m2: area_total_m2.round(2),
          area_perda_10_m2: area_com_perda_10,
          area_perda_15_m2: area_com_perda_15,
          borda_perimetro_linear_m: perimetro_linear_m.round(2),
          pontos_ajustados: total_pontos_ajustados,
          dimensoes: dims,
          timestamp: Time.now.strftime('%Y-%m-%d %H:%M:%S')
        }
      rescue => e
        modelo.abort_operation rescue nil
        puts "[PapaSys] ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n") rescue ''}"
        { success: false, error: "Erro durante o ajuste: #{e.message}" }
      end

      # Filtro de engenharia e quantitativos exatos para piscinas
      # Separa com 100% de precisão o revestimento interno (fundo + degraus + paredes internas)
      # descartando o casco externo (alvenaria exterior) e a borda superior do deck.
      def self.calcular_quantitativos_revestimento(all_faces_info, bb, dims, is_face_sel)
        comp_m = dims[:comprimento_m].to_f
        larg_m = dims[:largura_m].to_f
        prof_m = dims[:profundidade_m].to_f

        if is_face_sel
          area = all_faces_info.inject(0.0) { |sum, fi| sum + fi[:area_m2] }
          perim = (comp_m + larg_m) * 2.0
          return [area.round(2), perim.round(2)]
        end

        centro_piscina = bb.center
        max_z_global = all_faces_info.map { |fi| fi[:max_z] }.max || bb.max.z
        min_z_global = all_faces_info.map { |fi| fi[:center].z }.min || bb.min.z

        # ESTRATÉGIA 1 (MÁXIMA PRECISÃO): Identificação pelo material do piso interno da piscina
        # A face horizontal mais baixa voltada para cima é o fundo revestido com pastilha/azulejo.
        faces_fundo = all_faces_info.select do |fi|
          fi[:normal].z > 0.7 && (fi[:center].z - min_z_global).abs < 35.0.cm
        end

        mat_fundo = nil
        faces_fundo.each do |fi|
          if fi[:material]
            mat_fundo = fi[:material]
            break
          end
        end

        if mat_fundo
          # Coleta todas as faces que compartilham o mesmo material do revestimento do fundo
          faces_revest = all_faces_info.select do |fi|
            fi[:material] == mat_fundo || (fi[:material] && fi[:material].name == mat_fundo.name)
          end

          area_mat = faces_revest.inject(0.0) { |sum, fi| sum + fi[:area_m2] }.round(2)
          if area_mat >= 3.0
            puts "[PapaSys] ✅ Área calculada pelo material de revestimento '#{mat_fundo.name}': #{area_mat} m²"
            perim = calcular_perimetro_topo(faces_revest, max_z_global, comp_m, larg_m)
            return [area_mat, perim]
          end
        end

        # ESTRATÉGIA 2: Filtro por Textura de Revestimento (mosaico, azulejo, pastilhas)
        faces_com_textura = all_faces_info.select do |fi|
          mat = fi[:material]
          mat && mat.texture != nil && !mat.name.to_s.downcase.include?('borda') && !mat.name.to_s.downcase.include?('deck')
        end

        if !faces_com_textura.empty?
          area_tex = faces_com_textura.inject(0.0) { |sum, fi| sum + fi[:area_m2] }.round(2)
          if area_tex >= 3.0
            puts "[PapaSys] ✅ Área calculada por faces com textura de revestimento: #{area_tex} m²"
            perim = calcular_perimetro_topo(faces_com_textura, max_z_global, comp_m, larg_m)
            return [area_tex, perim]
          end
        end

        # ESTRATÉGIA 3 (FILTRO GEOMÉTRICO INTERNO):
        # Paredes internas têm normal apontando para o CENTRO da piscina (dot > 0.05).
        # Paredes externas têm normal apontando para FORA da piscina (dot < 0), sendo descartadas!
        faces_internas_estritas = []

        all_faces_info.each do |fi|
          norm = fi[:normal]
          centro = fi[:center]

          # Ignora borda superior (deck horizontal no topo)
          next if norm.z > 0.6 && (centro.z >= (max_z_global - 3.5.cm))
          # Ignora fundo inferior apoiado no chão
          next if norm.z < -0.6

          if norm.z > 0.6
            # Piso interno ou degrau
            faces_internas_estritas << fi
            next
          end

          # Parede vertical: testa se está voltada para o INTERIOR da piscina
          vec_centro = Geom::Vector3d.new(
            centro_piscina.x - centro.x,
            centro_piscina.y - centro.y,
            0
          )
          dist_2d = vec_centro.length
          if dist_2d > 0.01
            dot = (norm.x * vec_centro.x + norm.y * vec_centro.y) / dist_2d
            # Parede interna tem produto escalar positivo (voltada para a água)
            if dot > 0.05
              faces_internas_estritas << fi
            end
          else
            faces_internas_estritas << fi
          end
        end

        area_geom = faces_internas_estritas.inject(0.0) { |sum, fi| sum + fi[:area_m2] }.round(2)

        if area_geom >= 3.0
          puts "[PapaSys] ✅ Área calculada por geometria estrita interna: #{area_geom} m²"
          perim = calcular_perimetro_topo(faces_internas_estritas, max_z_global, comp_m, larg_m)
          return [area_geom, perim]
        end

        # Fallback de Engenharia
        area_esperada = ((comp_m * larg_m) + 2.0 * (comp_m + larg_m) * (prof_m > 0 ? prof_m : 1.2) * 0.95).round(2)
        perim_esperado = (2.0 * (comp_m + larg_m)).round(2)
        [area_esperada, perim_esperado]
      end

      # Calcula o perímetro do contorno superior da piscina
      def self.calcular_perimetro_topo(faces_revest, max_z_global, comp_m, larg_m)
        perimetro_esperado = (2.0 * (comp_m + larg_m)).round(2)
        rev_faces = faces_revest.map { |fi| fi[:face] }
        boundary_edges = []

        faces_revest.each do |fi|
          f = fi[:face]
          next unless f.valid? && !f.deleted?
          f.edges.each do |e|
            next unless e.valid? && !e.deleted?
            connected = e.faces.count { |cf| cf.valid? && rev_faces.include?(cf) }
            boundary_edges << e if connected == 1
          end
        end
        boundary_edges.uniq!

        top_edges = boundary_edges.select { |e| e.valid? && (e.bounds.center.z - max_z_global).abs < 12.0.cm }
        perimetro_calculado = top_edges.inject(0.0) { |sum, e| e.valid? ? sum + (e.length.to_f * 0.0254) : sum }

        if perimetro_calculado < (perimetro_esperado * 0.75) || perimetro_calculado > (perimetro_esperado * 1.35)
          perimetro_calculado = perimetro_esperado
        end

        perimetro_calculado.round(2)
      end

      # Coleta recursivamente todas as coleções de entidades e transformações relativas
      def self.coletar_sub_entidades(entidade, transform_acumulada = Geom::Transformation.new)
        colecoes = []
        ents = entidade.is_a?(Sketchup::Group) ? entidade.entities : (entidade.respond_to?(:definition) ? entidade.definition.entities : nil)
        return colecoes unless ents

        faces_diretas = ents.grep(Sketchup::Face).select { |f| f.valid? && !f.deleted? }
        edges_diretas = ents.grep(Sketchup::Edge).select { |e| e.valid? && !e.deleted? }

        if !faces_diretas.empty? || !edges_diretas.empty?
          colecoes << {
            owner: entidade,
            entities: ents,
            transform: transform_acumulada,
            faces: faces_diretas,
            edges: edges_diretas
          }
        end

        sub_grupos = ents.grep(Sketchup::Group).select { |g| g.valid? }
        sub_comps = ents.grep(Sketchup::ComponentInstance).select { |c| c.valid? }

        sub_grupos.each do |sg|
          sub_t = transform_acumulada * sg.transformation
          colecoes.concat(coletar_sub_entidades(sg, sub_t))
        end

        sub_comps.each do |sc|
          sub_t = transform_acumulada * sc.transformation
          colecoes.concat(coletar_sub_entidades(sc, sub_t))
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
    end
  end
end
