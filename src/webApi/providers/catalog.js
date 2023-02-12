'use strict';
const QueryString = require('querystring');
const HttpClient = require('../httpclient.js');

class CATALOG {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers = {
            'MS-CV': '0'
        };
    }

    searchTitle(query, marketLocale = 'us', languagesLocale = 'en-us') {
        return new Promise(async (resolve, reject) => {
            try {
                const searchParams = {
                    "languages": languagesLocale,
                    "market": marketLocale,
                    "platformdependencyname": 'windows.xbox',
                    "productFamilyNames": "Games,Apps",
                    "query": query,
                    "topProducts": 25,
                }
                const queryParams = QueryString.stringify(searchParams)
                const url = `https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?${queryParams}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getProductId(query, marketLocale = 'us', languagesLocale = 'en-us') {
        return new Promise(async (resolve, reject) => {
            try {
                const searchParams = {
                    "actionFilter": 'Browse',
                    "bigIds": [query],
                    "fieldsTemplate": 'details',
                    "languages": languagesLocale,
                    "market": marketLocale,
                }

                const queryParams = QueryString.stringify(searchParams)
                const url = `https://displaycatalog.mp.microsoft.com/v7.0/products?${queryParams}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getProductFromAlternateId(titleId, titleType, marketLocale = 'US', languagesLocale = 'en-US') {
        return new Promise(async (resolve, reject) => {
            try {
                const searchParams = {
                    "top": 25,
                    "alternateId": titleType,
                    "fieldsTemplate": 'details',
                    // "languages": 'en-US',
                    // "market": 'US',
                    "languages": languagesLocale,
                    "market": marketLocale,
                    "value": titleId,
                }

                const queryParams = QueryString.stringify(searchParams)
                const url = `https://displaycatalog.mp.microsoft.com/v7.0/products/lookup${queryParams}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = CATALOG;
