# encoding: UTF-8
# ==============================================================================
# PapaSys - Script de Disparo Direto via Console Ruby do SketchUp
# Você pode colar este código diretamente no Console do SketchUp (Janela > Console Ruby)
# Ele ajusta a piscina selecionada e envia IMEDIATAMENTE para o seu Supabase!
# ==============================================================================

require 'json'
require 'net/http'
require 'uri'
require 'openssl'

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

modelo = Sketchup.active_model
selecao = modelo.selection

faces_sel = selecao.grep(Sketchup::Face)
grupos_sel = selecao.grep(Sketchup::Group) + selecao.grep(Sketchup::ComponentInstance)

if faces_sel.empty? && grupos_sel.length != 1
  UI.messagebox("Por favor, selecione as faces do revestimento OU 1 grupo/componente da piscina.")
else
  is_face_sel = !faces_sel.empty?
  grupo = grupos_sel.first unless is_face_sel

  prompts = ["Nome do Projeto:", "Nome do Cliente:", "Largura da Peça (cm):", "Altura da Peça (cm):", "Rejunte (cm):"]
  defaults = ["Piscina Residencial", "Cliente PapaSys", 15.0, 15.0, 0.2]
  respostas = UI.inputbox(prompts, defaults, "PapaSys - Ajuste e Envio Nuvem")

  if respostas
    nome_proj, nome_cli, larg, alt, rej = respostas

    mod_h = (larg.to_f + rej.to_f).cm
    mod_v = (alt.to_f + rej.to_f).cm

    if is_face_sel
      vertices = []
      faces_sel.each { |f| vertices.concat(f.vertices) }
      vertices.uniq!

      bb = Geom::BoundingBox.new
      vertices.each { |v| bb.add(v.position) }
      ponto_zero = bb.center
      active_ents = modelo.active_entities
      dim_comprimento = (bb.width.to_f * 0.0254).round(2)
      dim_largura = (bb.height.to_f * 0.0254).round(2)
      dim_profundidade = (bb.depth.to_f * 0.0254).round(2)
    else
      grupo.make_unique rescue nil
      bounds = (grupo.respond_to?(:definition) && grupo.definition.respond_to?(:bounds)) ? grupo.definition.bounds : (grupo.respond_to?(:local_bounds) ? grupo.local_bounds : grupo.bounds)
      ponto_zero = bounds.center
      entities = grupo.is_a?(Sketchup::Group) ? grupo.entities : grupo.definition.entities
      active_ents = entities

      vertices = []
      entities.grep(Sketchup::Edge).each { |edge| vertices.concat(edge.vertices) }
      vertices.uniq!
      dim_comprimento = (bounds.width.to_f * 0.0254).round(2)
      dim_largura = (bounds.height.to_f * 0.0254).round(2)
      dim_profundidade = (bounds.depth.to_f * 0.0254).round(2)
    end

    vetores = []
    pontos_a_mover = []

    vertices.each do |v|
      pt = v.position

      delta_x = pt.x - ponto_zero.x
      delta_y = pt.y - ponto_zero.y
      delta_z = pt.z - ponto_zero.z

      novo_delta_x = (delta_x / mod_h).round * mod_h
      novo_delta_y = (delta_y / mod_h).round * mod_h
      novo_delta_z = (delta_z / mod_v).round * mod_v

      novo_pt = Geom::Point3d.new(
        ponto_zero.x + novo_delta_x,
        ponto_zero.y + novo_delta_y,
        ponto_zero.z + novo_delta_z
      )

      if pt.distance(novo_pt) > 0.001
        pontos_a_mover << v
        vetores << pt.vector_to(novo_pt)
      end
    end

    modelo.start_operation("Ajuste Modular PapaSys #{larg}x#{alt}", true)

    if !pontos_a_mover.empty?
      active_ents.transform_by_vectors(pontos_a_mover, vetores)
    end

    # ======================================================================
    # CÁLCULO PRECISO DE ÁREA E PERÍMETRO
    # ======================================================================
    area_revestimento_m2 = 0.0
    area_borda_topo_m2 = 0.0
    perimetro_linear_m = 0.0

    if is_face_sel
      area_revestimento_m2 = faces_sel.inject(0.0) { |sum, f| sum + f.area } * 0.00064516
      boundary_edges = []
      faces_sel.each do |f|
        f.edges.each { |e| boundary_edges << e if (e.faces & faces_sel).length == 1 }
      end
      boundary_edges.uniq!

      max_z = faces_sel.map { |f| f.vertices.map { |v| v.position.z }.max }.max
      top_edges = boundary_edges.select { |e| (e.bounds.center.z - max_z).abs < 5.0.cm }
      top_edges = boundary_edges if top_edges.empty?
      perimetro_linear_m = top_edges.inject(0.0) { |sum, e| sum + e.length.to_m }
    else
      all_faces = entities.grep(Sketchup::Face)
      max_z = all_faces.map { |f| f.bounds.max.z }.max

      # Borda horizontal do topo (normal.z > 0.7 e z >= max_z - 2.5cm)
      faces_borda_topo = all_faces.select do |f|
        f.normal.z > 0.7 && f.bounds.center.z >= (max_z - 2.5.cm)
      end
      area_borda_topo_m2 = faces_borda_topo.inject(0.0) { |sum, f| sum + f.area } * 0.00064516

      faces_revestimento = all_faces - faces_borda_topo
      area_revestimento_m2 = faces_revestimento.inject(0.0) { |sum, f| sum + f.area } * 0.00064516

      revestimento_boundary_edges = []
      faces_revestimento.each do |f|
        f.edges.each { |e| revestimento_boundary_edges << e if (e.faces & faces_revestimento).length == 1 }
      end
      revestimento_boundary_edges.uniq!

      top_edges = revestimento_boundary_edges.select { |e| (e.bounds.center.z - max_z).abs < 5.0.cm }
      top_edges = revestimento_boundary_edges if top_edges.empty?
      perimetro_linear_m = top_edges.inject(0.0) { |sum, e| sum + e.length.to_m }
    end

    modelo.commit_operation

    # Custo direto e preço sugerido de estimativa
    custo_direto = (area_revestimento_m2 * 230.0 + perimetro_linear_m * 175.0).round(2)
    preco_venda = (custo_direto * 1.25).round(2)

    # ENVIO DIRETO PARA O BANCO SUPABASE
    puts "\n============================================="
    puts "[PapaSys] Enviando projeto para o Supabase..."
    puts "[PapaSys] Área do Revestimento: #{area_revestimento_m2.round(2)} m² (Borda Topo: #{area_borda_topo_m2.round(2)} m²)"
    puts "[PapaSys] Borda Linear: #{perimetro_linear_m.round(2)} m"
    puts "============================================="

    supabase_url = 'https://bhbbpdvgkyjqxhghbmpe.supabase.co'
    supabase_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M'

    payload = {
      project_name: nome_proj,
      client_name: nome_cli,
      tile_spec: "#{larg}x#{alt}",
      tile_width_cm: larg.to_f,
      tile_height_cm: alt.to_f,
      grout_cm: rej.to_f,
      internal_area_m2: area_revestimento_m2.round(2),
      border_perimeter_linear_m: perimetro_linear_m.round(2),
      pool_length_m: dim_comprimento,
      pool_width_m: dim_largura,
      pool_depth_m: dim_profundidade,
      status: 'novo',
      total_cost: custo_direto,
      margin_percent: 25.0,
      total_price: preco_venda,
      notes: 'Paginação modular centralizada gerada diretamente no SketchUp.',
      plugin_version: '1.0.0'
    }

    begin
      uri = URI.parse("#{supabase_url}/rest/v1/projects")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.verify_mode = OpenSSL::SSL::VERIFY_NONE
      http.open_timeout = 6
      http.read_timeout = 6

      req = Net::HTTP::Post.new(uri.request_uri)
      req['apikey'] = supabase_key
      req['Authorization'] = "Bearer #{supabase_key}"
      req['Content-Type'] = 'application/json'
      req['Prefer'] = 'return=representation'
      req.body = JSON.generate(payload)

      res = http.request(req)

      if res.code.to_i >= 200 && res.code.to_i < 300
        res_data = JSON.parse(res.body) rescue []
        created = res_data.is_a?(Array) ? res_data.first : res_data
        proj_id = created ? created['id'] : nil

        msg = "✅ Ajuste e Envio concluídos com SUCESSO!\n\n"
        msg += "Projeto: #{nome_proj}\n"
        msg += "Área do Revestimento: #{area_revestimento_m2.round(2)} m²\n"
        msg += "Perímetro da Borda: #{perimetro_linear_m.round(2)} m linear\n"
        msg += "Valor Sugerido: R$ #{preco_venda.to_s.reverse.gsub(/(\d{3})(?=\d)/, '\\1.').reverse}\n\n"
        msg += "Deseja abrir o Orçamento Web no navegador agora?"
        abrir = UI.messagebox(msg, MB_YESNO)
        if abrir == 6 # IDYES
          url = proj_id ? "file:///d:/COISAS/SISTEMAS/PapaSys/sistema_web/orcamento.html?id=#{proj_id}" : "file:///d:/COISAS/SISTEMAS/PapaSys/sistema_web/index.html"
          UI.openURL(url)
        end
      else
        UI.messagebox("Ajuste concluído no 3D, mas o servidor retornou erro HTTP #{res.code}:\n#{res.body}")
      end
    rescue => e
      UI.messagebox("Ajuste concluído no 3D, mas falhou a conexão com a nuvem:\n#{e.message}")
    end
  end
end
