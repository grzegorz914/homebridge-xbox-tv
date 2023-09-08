"use strict";

const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const Authentication = require('../src/webApi/authentication.js')

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    //clear web api token
    this.onRequest('/clearToken', this.startAuthorization.bind(this));

    //start console authorization
    this.onRequest('/startAuthorization', this.startAuthorization.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async startAuthorization(payload) {

    const mode = payload.mode;
    const host = payload.host;
    const webApiToken = payload.webApiToken;
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

    const authConfig = {
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      tokensFile: tokensFile
    }
    const authentication = new Authentication(authConfig);

    let data = {};
    switch (mode) {
      case 'clearToken':
        try {
          await authentication.clearTokens();
          data = {
            info: 'Web Api Token cleared, now You can start new authorization process.',
            status: 0
          };
        } catch (error) {
          data = {
            info: 'Clear token error:',
            status: 3,
            error: error
          };
        };
        break;
      case 'authorization':
        try {
          await authentication.checkAuthorization();
          data = {
            info: 'Console authorized and activated. To start new process please clear Web API Token first.',
            status: 0
          };
        } catch (error) {
          if (webApiToken) {
            try {
              await authentication.accessToken(webApiToken);
              data = {
                info: 'Activation successfull, now restart plugin and have fun!!!',
                status: 2
              };
            } catch (error) {
              data = {
                info: 'Error',
                status: 3,
                error: error
              };
            };
          } else {
            const oauth2URI = await authentication.generateAuthorizationUrl();
            data = {
              info: oauth2URI,
              status: 1
            };
          };
        };
        break;
    };

    return data;
  };
};

(() => {
  return new PluginUiServer();
})();
