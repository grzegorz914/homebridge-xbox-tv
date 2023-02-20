"use strict";

const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const Authentication = require('../src/webApi/authentication.js')
const fs = require('fs');
const fsPromises = fs.promises;

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    this.data = {};

    // clear token
    this.onRequest('/clearToken', this.clearToken.bind(this));

    // start console authorization
    this.onRequest('/startAuthorization', this.getWebApiToken.bind(this));

    // this MUST be called when you are ready to accept requests
    this.ready();
  };

  async clearToken(payload) {
    const host = payload.host;
    const authTokenFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

    try {
      if (fs.existsSync(authTokenFile)) {
        await fsPromises.writeFile(authTokenFile, JSON.stringify({}));
      };

      return true;
    } catch (e) {
      throw new RequestError('Clear token file failed.', {
        message: e.message
      });
    };
  };

  async getWebApiToken(payload) {

    try {
      const host = payload.host;
      const webApiToken = payload.webApiToken;
      const authTokenFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

      const authenticationConfig = {
        clientId: payload.clientId,
        clientSecret: payload.clientSecret,
        userToken: payload.userToken,
        uhs: payload.uhs,
        tokensFile: authTokenFile
      }
      const authentication = new Authentication(authenticationConfig);

      try {
        await authentication.isAuthenticated();
        this.data = {
          info: 'Console already authorized. To start a new athorization process you need clear the Web API Token first.',
          status: 0
        };
      } catch (error) {
        if (webApiToken) {
          try {
            await authentication.getTokenRequest(webApiToken);
            this.data = {
              info: 'Console successfully authorized and token file saved.',
              status: 2
            };
          } catch (error) {
            this.data = {
              info: 'Authorization or save token file error.',
              status: 3
            };
          };
        } else {
          const oauth2URI = await authentication.generateAuthorizationUrl();
          this.data = {
            info: oauth2URI,
            status: 1
          };
        };
      };

      return this.data;
    } catch (e) {
      throw new RequestError('Failed to return data try again.', {
        message: e.message
      });
    };
  };
};

(() => {
  return new PluginUiServer();
})();
