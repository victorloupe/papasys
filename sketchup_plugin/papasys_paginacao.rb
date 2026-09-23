# encoding: UTF-8
# ==============================================================================
# PapaSys Paginação - Extensão para SketchUp
# Registro da Extensão no Gerenciador de Extensões do SketchUp
# ==============================================================================

require 'sketchup.rb'
require 'extensions.rb'

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
    unless file_loaded?(__FILE__)
      extension = SketchupExtension.new('PapaSys Paginação Inteligente', File.join(File.dirname(__FILE__), 'papasys_paginacao', '__init__.rb'))
      extension.description = 'Ajuste modular sem recortes para piscinas, quantitativos automáticos (m² e borda) e integração direta com o sistema orçamentário web PapaSys.'
      extension.version     = '1.1.0'
      extension.creator     = 'PapaSys'
      extension.copyright   = '2026 PapaSys'
      
      Sketchup.register_extension(extension, true)
      file_loaded?(__FILE__)
    end
  end
end
