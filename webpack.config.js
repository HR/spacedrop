const HtmlWebPackPlugin = require('html-webpack-plugin'),
  MiniCssExtractPlugin = require('mini-css-extract-plugin'),
  // sassLoader = require('./scripts/sass-loader.js'),
  path = require('path')

module.exports = {
  entry: path.resolve(__dirname, 'src/renderer/index.js'),
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'app'),
    filename: 'app.js'
  },
  devtool: 'eval-cheap-source-map',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      },
      {
        test: /\.s[ac]ss$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
      },
      {
        test: /\.html$/,
        use: {
          loader: 'html-loader'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        use: {
          loader: 'file-loader'
        }
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'app.css'
    }),
    new HtmlWebPackPlugin({
      template: './static/index.html',
      filename: './index.html'
    })
  ],
  devServer: {
    open: false,
    port: 9000
  }
}
