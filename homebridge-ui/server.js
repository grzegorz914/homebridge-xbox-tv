"use strict";

const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const Authentication = require('../src/webApi/authentication.js')
const fs = require('fs');
const fsPromises = fs.promises;

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

    try {
      const mode = payload.mode;
      const host = payload.host;
      const webApiToken = payload.webApiToken;
      const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

      const authConfig = {
        xboxLiveUser: payload.xboxLiveUser,
        xboxLivePasswd: payload.xboxLivePasswd,
        clientId: payload.clientId,
        clientSecret: payload.clientSecret,
        userToken: payload.userToken,
        userHash: payload.userHash,
        tokensFile: tokensFile
      }
      const authentication = new Authentication(authConfig);

      switch (mode) {
        case 0:
          try {
            await authentication.clearToken();
            this.data = {
              info: 'Web Api Token cleared, now You can start new authorization process.',
              status: 0
            };
          } catch (error) {
            this.data = {
              info: 'Error',
              status: 3,
              error: error
            };
          };
          break;
        case 1:
          try {
            await authentication.checkAuthorization();
            this.data = {
              info: 'Console authorized and activated. To start new process please clear Web API Token first.',
              status: 0
            };
          } catch (error) {
            if (webApiToken) {
              try {
                await authentication.accessToken(webApiToken);
                this.data = {
                  info: 'Activation successfull, now restart plugin and have fun!!!',
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
          break;
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
