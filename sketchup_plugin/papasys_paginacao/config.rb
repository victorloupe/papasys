# encoding: UTF-8
module PapaSys
  module Paginacao
    module Config
      DEFAULT_SUPABASE_URL = 'https://bhbbpdvgkyjqxhghbmpe.supabase.co'.freeze
      DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M'.freeze

      DEFAULT_SERVER_URL = 'https://bhbbpdvgkyjqxhghbmpe.supabase.co'.freeze
      DEFAULT_LARGURA_CM = 15.0
      DEFAULT_ALTURA_CM = 15.0
      DEFAULT_REJUNTE_CM = 0.2

      def self.server_url
        Sketchup.read_default(PREFS_KEY, 'server_url', DEFAULT_SERVER_URL)
      end

      def self.server_url=(url)
        url = url.to_s.strip.chomp('/')
        Sketchup.write_default(PREFS_KEY, 'server_url', url)
      end

      def self.supabase_key
        Sketchup.read_default(PREFS_KEY, 'supabase_key', DEFAULT_SUPABASE_KEY)
      end

      def self.supabase_key=(key)
        Sketchup.write_default(PREFS_KEY, 'supabase_key', key.to_s.strip)
      end

      def self.auto_update?
        val = Sketchup.read_default(PREFS_KEY, 'auto_update', true)
        val == true || val == 'true' || val == 1
      end

      def self.auto_update=(enabled)
        Sketchup.write_default(PREFS_KEY, 'auto_update', enabled ? true : false)
      end

      def self.last_check_time
        Sketchup.read_default(PREFS_KEY, 'last_check_time', 0).to_i
      end

      def self.last_check_time=(time_i)
        Sketchup.write_default(PREFS_KEY, 'last_check_time', time_i)
      end

      def self.largura_cm
        Sketchup.read_default(PREFS_KEY, 'largura_cm', DEFAULT_LARGURA_CM).to_f
      end

      def self.largura_cm=(val)
        Sketchup.write_default(PREFS_KEY, 'largura_cm', val.to_f)
      end

      def self.altura_cm
        Sketchup.read_default(PREFS_KEY, 'altura_cm', DEFAULT_ALTURA_CM).to_f
      end

      def self.altura_cm=(val)
        Sketchup.write_default(PREFS_KEY, 'altura_cm', val.to_f)
      end

      def self.rejunte_cm
        Sketchup.read_default(PREFS_KEY, 'rejunte_cm', DEFAULT_REJUNTE_CM).to_f
      end

      def self.rejunte_cm=(val)
        Sketchup.write_default(PREFS_KEY, 'rejunte_cm', val.to_f)
      end
    end
  end
end
