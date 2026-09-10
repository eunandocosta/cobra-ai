// Provedor Express Resiliente: utiliza 'express' se instalado, ou provê interface nativa compatível
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

let realExpress = null;
try {
  realExpress = require('express');
} catch (e) {
  // express não instalado ainda no ambiente local; fallback nativo Express-compatible ativado
}

if (realExpress) {
  module.exports = realExpress;
} else {
  class MiniRouter {
    constructor() {
      this.routes = [];
      this.middlewares = [];
    }

    use(middleware) {
      if (typeof middleware === 'function') {
        this.middlewares.push(middleware);
      }
      return this;
    }

    addRoute(method, routePath, ...handlers) {
      const paramNames = [];
      const regexStr = '^' + routePath
        .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
          paramNames.push(name);
          return '([^/]+)';
        })
        .replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexStr);

      this.routes.push({
        method: method.toUpperCase(),
        path: routePath,
        regex,
        paramNames,
        handler: handlers[handlers.length - 1]
      });
      return this;
    }

    get(path, ...handlers) { return this.addRoute('GET', path, ...handlers); }
    post(path, ...handlers) { return this.addRoute('POST', path, ...handlers); }
    put(path, ...handlers) { return this.addRoute('PUT', path, ...handlers); }
    delete(path, ...handlers) { return this.addRoute('DELETE', path, ...handlers); }

    match(method, pathname) {
      for (const r of this.routes) {
        if (r.method === method.toUpperCase()) {
          const match = pathname.match(r.regex);
          if (match) {
            const params = {};
            r.paramNames.forEach((name, idx) => {
              params[name] = decodeURIComponent(match[idx + 1]);
            });
            return { handler: r.handler, params };
          }
        }
      }
      return null;
    }
  }

  function createApplication() {
    const globalMiddlewares = [];
    const mounts = [];

    const app = function(req, res) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      req.pathname = parsedUrl.pathname || '/';
      req.params = {};

      res.json = function(data) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      res.status = function(code) {
        res.statusCode = code;
        return res;
      };

      res.sendFile = function(filePath) {
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
          };
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(filePath).pipe(res);
        } else {
          res.statusCode = 404;
          res.end('Not Found');
        }
      };

      // Executa leitura de body caso necessário
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        try {
          if (bodyData && (req.headers['content-type'] || '').includes('application/json')) {
            req.body = JSON.parse(bodyData);
          } else {
            req.body = bodyData ? { raw: bodyData } : {};
          }
        } catch (e) {
          req.body = {};
        }

        // Executa middlewares globais
        for (const mw of globalMiddlewares) {
          try { mw(req, res, () => {}); } catch (e) {}
        }

        // Roteamento
        for (const mount of mounts) {
          if (mount.prefix === null) {
            // Rota direta registrada com app.get(...)
            const match = mount.router.match(req.method, req.pathname);
            if (match) {
              req.params = match.params;
              return match.handler(req, res);
            }
          } else if (req.pathname === mount.prefix || req.pathname.startsWith(mount.prefix + '/')) {
            const subPath = req.pathname.slice(mount.prefix.length) || '/';
            const match = mount.router.match(req.method, subPath);
            if (match) {
              req.params = match.params;
              return match.handler(req, res);
            }
          }
        }

        res.statusCode = 404;
        res.json({ error: 'Endpoint não encontrado', path: req.pathname });
      });
    };

    app.handle = app;

    app.use = function(prefixOrMiddleware, router) {
      if (typeof prefixOrMiddleware === 'string' && router && router.match) {
        mounts.push({ prefix: prefixOrMiddleware.replace(/\/$/, ''), router });
      } else if (prefixOrMiddleware && prefixOrMiddleware.match) {
        mounts.push({ prefix: '', router: prefixOrMiddleware });
      } else if (typeof prefixOrMiddleware === 'function') {
        globalMiddlewares.push(prefixOrMiddleware);
      }
      return app;
    };

    const directRouter = new MiniRouter();
    mounts.push({ prefix: null, router: directRouter });

    app.get = function(path, ...handlers) { directRouter.get(path, ...handlers); return app; };
    app.post = function(path, ...handlers) { directRouter.post(path, ...handlers); return app; };
    app.put = function(path, ...handlers) { directRouter.put(path, ...handlers); return app; };
    app.delete = function(path, ...handlers) { directRouter.delete(path, ...handlers); return app; };

    app.listen = function(port, callback) {
      const server = http.createServer(app);
      server.listen(port, callback);
      return server;
    };

    return app;
  }

  createApplication.Router = function() {
    return new MiniRouter();
  };

  createApplication.json = function() {
    return (req, res, next) => { if (next) next(); };
  };

  createApplication.urlencoded = function() {
    return (req, res, next) => { if (next) next(); };
  };

  createApplication.static = function(staticPath) {
    return (req, res, next) => {
      const filePath = path.join(staticPath, req.pathname === '/' ? 'index.html' : req.pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
      } else if (next) {
        next();
      }
    };
  };

  module.exports = createApplication;
}
