/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config) => {
    // pdf.js optionally requires node-canvas on the server; we only use it in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};
