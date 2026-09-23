# encoding: UTF-8
# ==============================================================================
# PapaSys Paginação - Script de Recarga em Tempo Real
# ==============================================================================

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

dir = File.dirname(__FILE__)
arquivos = ['version.rb', 'config.rb', 'geom_engine.rb', 'api_client.rb', 'updater.rb', 'ui_dialog.rb']

arquivos.each do |arq|
  caminho = File.join(dir, arq)
  if File.exist?(caminho)
    load caminho
    puts "[PapaSys] Recarregado: #{arq}"
  end
end

puts "[PapaSys] ✅ Sucesso! Todos os módulos foram recarregados com sucesso!"
PapaSys::Paginacao::UiDialog.reload_window!
