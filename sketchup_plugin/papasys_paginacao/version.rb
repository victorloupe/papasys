# encoding: UTF-8
module PapaSys
  module Paginacao
    remove_const(:VERSION) if const_defined?(:VERSION)
    VERSION = '2.0.9'.freeze
    remove_const(:PLUGIN_NAME) if const_defined?(:PLUGIN_NAME)
    PLUGIN_NAME = 'iGUi Orçamentos 3D'.freeze
    remove_const(:PREFS_KEY) if const_defined?(:PREFS_KEY)
    PREFS_KEY = 'iGUiOrcamentosConfig'.freeze
  end
end
