"use strict";

const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const Authentication = require('../src/webApi/authentication.js')
const fs = require('fs');
const fsPromises = fs.promises;

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
    try {
      const host = payload.host;
      const authTokenFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;
      await fsPromises.writeFile(authTokenFile, JSON.stringify({}));
      return true;
    } catch (e) {
      throw new RequestError(`Clear token error: ${e.message}`);
    };
  };

  async startAuthorization(payload) {

    try {
      const host = payload.host;
      const webApiToken = payload.webApiToken;
      const authTokenFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

      const authConfig = {
        xboxLiveUser: payload.xboxLiveUser,
        xboxLivePasswd: payload.xboxLivePasswd,
        clientId: payload.clientId,
        clientSecret: payload.clientSecret,
        userToken: payload.userToken,
        userHash: payload.userHash,
        tokensFile: authTokenFile
      }
      const authentication = new Authentication(authConfig);

      try {
        await authentication.checkAuthorization();
        this.data = {
          info: 'Console already authorized. To start a new athorization process you need clear the Web API Token first.',
          status: 0
        };
      } catch (error) {
        if (webApiToken) {
          try {
            await authentication.accessToken(webApiToken);
            this.data = {
              info: 'Console successfully authorized and token file saved.',
              status: 2
            };
          } catch (error) {
            this.data = {
              info: 'Error',
              status: 3,
              error: error
            };
          };
        } else {
          try {
            const oauth2URI = await authentication.generateAuthorizationUrl();
            //this.pushEvent('webApiToken', { code: webApiToken });
            this.data = {
              info: oauth2URI,
              status: 1
            };
          } catch (error) {
            this.data = {
              info: 'Error',
              status: 3,
              error: error
            };
          };
        };
      };

      return this.data;
    } catch (e) {
      throw new RequestError(`Authorization data error: ${e.message}`);
    };
  };
};

(() => {
  return new PluginUiServer();
})();
