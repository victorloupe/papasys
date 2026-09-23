# encoding: UTF-8
# ==============================================================================
# PapaSys Paginação Inteligente - Inicializador Principal e Barra de Ferramentas
# ==============================================================================

require 'sketchup.rb'

# Extensão utilitária para converter polegadas em metros no SketchUp
class Numeric
  def to_m
    self.to_f * 0.0254
  end unless method_defined?(:to_m)
end

class Length
  def to_m
    self.to_f * 0.0254
  end unless method_defined?(:to_m)
end

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
    dir = File.dirname(__FILE__)
    require File.join(dir, 'version.rb')
    require File.join(dir, 'config.rb')
    require File.join(dir, 'geom_engine.rb')
    require File.join(dir, 'api_client.rb')
    require File.join(dir, 'updater.rb')
    require File.join(dir, 'ui_dialog.rb')

    # Recarrega todos os arquivos na memória do SketchUp em tempo de execução
    def self.reload!
      d = File.dirname(__FILE__)
      ['version.rb', 'config.rb', 'geom_engine.rb', 'api_client.rb', 'updater.rb', 'ui_dialog.rb'].each do |f|
        load File.join(d, f)
      end
      puts "[PapaSys] ✅ Todos os módulos recarregados na memória com sucesso!"
      UiDialog.reload_window!
    end


    unless file_loaded?(__FILE__)
      icons_dir = File.join(dir, 'icons')

      # 1. Comando: Painel Principal Interativo
      cmd_abrir = UI::Command.new('Painel PapaSys') do
        UiDialog.show
      end
      cmd_abrir.tooltip = 'PapaSys: Painel de Paginação e Orçamentos'
      cmd_abrir.status_bar_text = 'Abrir painel interativo PapaSys com quantitativos e envio para a nuvem'
      cmd_abrir.small_icon = File.join(icons_dir, 'painel_24.png')
      cmd_abrir.large_icon = File.join(icons_dir, 'painel_32.png')

      # 2. Comando: ⚡ Ajuste Rápido & Envio Imediato (1 Clique direto na barra de ferramentas)
      cmd_rapido = UI::Command.new('Ajuste Rápido (1 Clique)') do
        larg = Config.largura_cm
        alt = Config.altura_cm
        rej = Config.rejunte_cm
        
        modelo = Sketchup.active_model
        if modelo.selection.length != 1
          UI.messagebox("Por favor, selecione UM grupo ou componente (a pele da piscina) antes de clicar.")
        else
          res = GeomEngine.ajustar_piscina(larg, alt, rej, { projeto: 'Piscina PapaSys 3D' })
          if res[:success]
            ApiClient.enviar_projeto(res) do |ok, msg|
              if ok
                UI.messagebox("⚡ PapaSys: Piscina modulada pelo centro e enviada com SUCESSO!\n\nÁrea: #{res[:area_interna_m2]} m²\nBorda: #{res[:borda_perimetro_linear_m]} m linear\n\nAbra o painel web PapaSys para visualizar o orçamento completo.")
              else
                UI.messagebox("Ajuste concluído no 3D, mas falhou o envio para nuvem: #{msg[:error]}")
              end
            end
          else
            UI.messagebox(res[:error])
          end
        end
      end
      cmd_rapido.tooltip = 'PapaSys: Ajuste Modular e Envio para Nuvem em 1 Clique'
      cmd_rapido.status_bar_text = 'Ajusta a piscina selecionada sem recortes e envia direto para o Supabase'
      cmd_rapido.small_icon = File.join(icons_dir, 'rapido_24.png')
      cmd_rapido.large_icon = File.join(icons_dir, 'rapido_32.png')

      # 3. Comando: Verificar Atualizações
      cmd_update = UI::Command.new('Verificar Atualizações') do
        Updater.check(silent: false, auto_install: true)
      end
      cmd_update.tooltip = 'PapaSys: Verificar Atualizações do Plugin'
      cmd_update.status_bar_text = 'Verifica e atualiza o plugin PapaSys automaticamente'
      cmd_update.small_icon = File.join(icons_dir, 'update_24.png')
      cmd_update.large_icon = File.join(icons_dir, 'update_32.png')

      # Menus Superiores (Extensões > PapaSys Paginação)
      menu_plugins = UI.menu('Plugins') || UI.menu('Extensions')
      sub_menu = menu_plugins.add_submenu('PapaSys Paginação')
      sub_menu.add_item(cmd_abrir)
      sub_menu.add_item(cmd_rapido)
      sub_menu.add_separator
      sub_menu.add_item(cmd_update)

      # Barra de Ferramentas (Toolbar) com Ícones Nítidos
      toolbar = UI::Toolbar.new('PapaSys')
      toolbar.add_item(cmd_abrir)
      toolbar.add_item(cmd_rapido)
      toolbar.add_item(cmd_update)
      toolbar.restore

      # Verificação silenciosa em segundo plano
      Updater.start_auto_check

      file_loaded?(__FILE__)
    end
  end
end
