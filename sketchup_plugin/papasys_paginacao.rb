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
      extension = SketchupExtension.new('iGUi Orçamentos 3D', File.join(File.dirname(__FILE__), 'papasys_paginacao', '__init__.rb'))
      extension.description = 'Extensão oficial iGUi para cálculo modular sem recortes, quantitativos automáticos (m² e laminação) e integração com o sistema web iGUi.'
      extension.version     = '2.1.0'
      extension.creator     = 'iGUi'
      extension.copyright   = '2026 iGUi'
      
      Sketchup.register_extension(extension, true)
      file_loaded?(__FILE__)
    end
  end
end
