"use strict";

import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import Authentication from '../src/webApi/authentication.js';

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    //clear web api token
    this.onRequest('/clearToken', this.clearToken.bind(this));

    //start console authorization
    this.onRequest('/startAuthorization', this.startAuthorization.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async clearToken(payload) {
    const host = payload.host;
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

    const authConfig = {
      webApiClientId: payload.webApiClientId,
      webApiClientSecret: payload.webApiClientSecret,
      tokensFile: tokensFile
    }
    const authentication = new Authentication(authConfig);

    try {
      const tokens = {
        oauth: {},
        user: {},
        xsts: {}
      };
      await authentication.saveData(tokensFile, tokens);
      return true;
    } catch (error) {
      throw new Error(`Clear token error: ${error.message ?? error}.`);
    };
  };

  async startAuthorization(payload) {
    const host = payload.host;
    const webApiToken = payload.webApiToken;
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

    const authConfig = {
      webApiClientId: payload.webApiClientId,
      webApiClientSecret: payload.webApiClientSecret,
      tokensFile: tokensFile
    }
    const authentication = new Authentication(authConfig);
    let data = {};

    try {
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
              info: 'Activation console successfull, now restart plugin and have fun!!!',
              status: 2
            };
          } catch (error) {
            throw new Error(`Activation console error: ${error.message ?? error}.`);
          };
        } else {
          const oauth2URI = await authentication.generateAuthorizationUrl();
          data = {
            info: oauth2URI,
            status: 1
          };
        };
      };

      return data;
    } catch (error) {
      throw new Error(`Authorization manager error: ${error.message ?? error}.`);
    };
  };
};

(() => {
  return new PluginUiServer();
})();
