module.exports = function(grunt) {

    grunt.initConfig({

        terser: {
            build: {
                options: {
                    compress: true,
                    mangle: true,
                    format: {
                        comments: false
                    }
                },
                files: {
                    'dist/editor.js': ['src/editor.js']
                }
            }
        },

        watch: {
            scripts: {
                files: ['src/editor.js'],
                tasks: ['terser'],
                options: {
                    spawn: false
                }
            }
        }

    });

    grunt.loadNpmTasks('grunt-terser');
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask('default', ['terser']);
};