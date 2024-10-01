module.exports = {
  server: {
      baseDir: "./",
      middleware: function (req, res, next) {
          // Set the custom headers here
          res.setHeader("Access-Control-Allow-Origin", "*"); // Example for CORS
          res.setHeader("X-Custom-Header", "MyCustomValue");
          next();
      }
  },
  files: [
      "dist/css/*.css",
      "dist/js/*.js",
      "**/*.html",
      "!node_modules/**/*.html"
  ]
};
