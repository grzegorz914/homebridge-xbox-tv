import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import Authentication from '../src/webApi/authentication.js';
import Functions from '../src/functions.js';

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.functions = new Functions();

    //clear web api token
    this.onRequest('/clearToken', this.clearToken.bind(this));

    //start console authorization
    this.onRequest('/startAuthorization', this.startAuthorization.bind(this));

    //this MUST be called when you are ready to accept requests
    this.ready();
  };

  async clearToken(payload) {
    const hostKey = payload.host.replace(/\./g, '');
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${hostKey}`;

    try {
      const emptyTokens = { oauth: {}, user: {}, xsts: {} };
      await this.functions.saveData(tokensFile, emptyTokens);
      return true;
    } catch (error) {
      throw new Error(`Clear token error: ${error?.message ?? error}`);
    }
  }

  async startAuthorization(payload) {
    const hostKey = payload.host.replace(/\./g, '');
    const tokensFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${hostKey}`;

    const authConfig = {
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      tokensFile
    };

    const authentication = new Authentication(authConfig);
    const webApiToken = payload.token;

    try {
      // Case: Console already authorized
      await authentication.checkAuthorization();
      return {
        info: 'Console authorized and activated. To start a new process, please clear the Web API Token first.',
        status: 0  // Authorized
      };
    } catch {
      if (webApiToken) {
        try {
          await authentication.accessToken(webApiToken);
          return {
            info: 'Activation successful! Now restart the plugin and have fun!',
            status: 2  // Token activated
          };
        } catch (error) {
          throw new Error(`Activation console error: ${error?.message ?? error}`);
        }
      }

      // No token, generate auth URL
      try {
        const oauth2URI = await authentication.generateAuthorizationUrl();
        return {
          info: oauth2URI,
          status: 1  // Needs user authorization
        };
      } catch (error) {
        throw new Error(`Failed to generate authorization URL: ${error?.message ?? error}`);
      }
    }
  }
}

(() => {
  return new PluginUiServer();
})();
