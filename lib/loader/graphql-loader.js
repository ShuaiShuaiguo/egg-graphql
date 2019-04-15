'use strict';

const { join, dirname } = require('path');
const { merge, isFunction } = require('lodash');
const is = require('is-type-of');
const {
  makeExecutableSchema,
  SchemaDirectiveVisitor,
} = require('graphql-tools');

const SYMBOL_SCHEMA = Symbol('Application#schema');
const SYMBOL_CONNECTOR_CLASS = Symbol('Application#connectorClass');

module.exports = app => {
  const directiveResolvers = {};
  const schemaDirectives = {};
  const resolvers = {};
  const typeDefs = [];

  class GraphqlLoader {
    constructor(app) {
      this.app = app;
    }

    load() {
      const connectorClasses = new Map();
      this.loadGraphql(connectorClasses);
      this.loadTypeDefs();
      /**
       * create a GraphQL.js GraphQLSchema instance
       */
      Object.defineProperties(this.app, {
        schema: {
          get() {
            if (!this[SYMBOL_SCHEMA]) {
              this[SYMBOL_SCHEMA] = makeExecutableSchema({
                typeDefs,
                resolvers,
                directiveResolvers,
                schemaDirectives,
              });
            }
            return this[SYMBOL_SCHEMA];
          },
        },
        connectorClass: {
          get() {
            if (!this[SYMBOL_CONNECTOR_CLASS]) {
              this[SYMBOL_CONNECTOR_CLASS] = connectorClasses;
            }
            return this[SYMBOL_CONNECTOR_CLASS];
          },
        },
      });
    }
    // 加载graphql
    loadGraphql(connectorClasses) {
      const loader = this.app.loader;
      loader.timing.start('Loader Graphql');
      const opt = {
        caseStyle: 'lower',
        directory: join(this.app.baseDir, 'app/graphql'),
        target: {},
        initializer: (obj, opt) => {
          const pathName = opt.pathName.split('.').pop();
          // 加载resolver
          if (pathName === 'resolver') {
            if (isFunction(obj)) {
              obj = obj(this.app);
            }
            merge(resolvers, obj);
          }
          // load schemaDirective
          if (is.class(obj)) {
            const proto = Object.getPrototypeOf(obj);
            if (proto === SchemaDirectiveVisitor) {
              const name = opt.pathName.split('.').pop();
              schemaDirectives[name] = obj;
            }
          }
          if (pathName === 'schemaDirective') {
            merge(schemaDirectives, obj);
          }
          // load directiveResolver
          if (pathName === 'directive') {
            merge(directiveResolvers, obj);
          }
          // load connector
          if (pathName === 'connector') {
            // 获取文件目录名
            const type = dirname(opt.path)
              .split(/\/|\\/)
              .pop();
            connectorClasses.set(type, obj);
          }
        },
      };
      new this.app.loader.FileLoader(opt).load();
      loader.timing.end('Loader Graphql');
    }
    // 加载typeDefs
    loadTypeDefs() {
      const opt = {
        directory: join(this.app.baseDir, 'app/graphql'),
        match: '**/*.graphql',
        target: {},
        initializer: obj => {
          typeDefs.push(obj.toString('utf8'));
        },
      };
      new this.app.loader.FileLoader(opt).load();
    }
  }

  new GraphqlLoader(app).load();
};
