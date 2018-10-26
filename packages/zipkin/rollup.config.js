import babel from 'rollup-plugin-babel';
import { uglify } from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import builtins from 'rollup-plugin-node-builtins';
import globals from 'rollup-plugin-node-globals';
import pkg from './package.json'

module.exports = [
  {
    input: 'src/index.js',
    output: {
      name: 'zipkin',
      file: pkg.browser,
      format: 'umd',
      exports: 'named',
      globals: {
        url: 'url',
        os: 'os'
      }
    },
    plugins: [
      globals(),
      builtins(),
      resolve(),
      babel({
        plugins: ['external-helpers'],
        externalHelpers: true,
        babelrc: false,
        presets: [
          ['es2015', {
              'modules': false
            }
          ]
        ],
        exclude: 'node_modules/**',
      }),
      commonjs()
    ],
    external: ['url', 'os']
  },
	{
		input: 'src/index.js',
		output: [
			{ file: pkg.node, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
    ],
    external: ['url', 'os']
	}
]
