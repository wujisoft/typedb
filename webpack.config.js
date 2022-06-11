const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const DtsBundlePlugin = require('dts-bundle-webpack');

module.exports = {
    mode: 'production',
    entry: './src/index.ts',
    externals: {
        'redis': 'redis'
    },
    module: {
        rules: [{
            test: /\.ts$/,
            use: [{ 
                loader: 'ts-loader',
                options: {
                    configFile: "tsconfig.webpack.json"
                }
            }],
            exclude: /node_modules/
        }]
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'typedb.js',
        path: path.resolve(__dirname, 'dist'),
        library: {
            type: 'umd',
            name: 'TypeDb'
        },
        globalObject: 'this'
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({
            terserOptions: {
                compress: true,
                module: true,
                mangle: {
                    keep_classnames: /ADbTableBase/
                }
            },
            extractComments: {
                filename: (fd) => `${fd.filename}.txt`,
                banner: () => ''
            }
        })],
    },
    plugins: [
        new DtsBundlePlugin({
            name: '@gymcore/typedb',
            main: 'dist/index.d.ts',
            out: 'typedb.d.ts',
            removeSource: true,
        })
    ]

}