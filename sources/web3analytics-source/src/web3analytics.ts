import {ComposeClient} from '@composedb/client';
import VError from '@openagenda/verror';
import {ethers} from 'ethers';
import {AirbyteConfig, AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import path from 'path';
import * as u8a from 'uint8arrays';
import * as url from 'url';

import {definition} from '../resources/schemas/definition.js';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const web3AnalyticsABI = fs.readJSONSync(
  path.resolve(__dirname, '../resources/abi/Web3Analytics.json')
);

export interface Web3AnalyticsConfig extends AirbyteConfig {
  readonly node_url: string;
  readonly ceramic_url: string;
  readonly web3analytics_address: string;
}

export class Web3Analytics {
  private static web3analytics: Web3Analytics = null;

  constructor(
    private readonly composedb: ComposeClient,
    private readonly provider: ethers.providers.JsonRpcProvider,
    private readonly cfg: Web3AnalyticsConfig
  ) {}

  static async instance(
    config: Web3AnalyticsConfig,
    logger: AirbyteLogger
  ): Promise<Web3Analytics> {
    if (Web3Analytics.web3analytics) return Web3Analytics.web3analytics;

    if (!config.node_url) {
      throw new VError('No node url provided');
    }
    if (!config.ceramic_url) {
      throw new VError('No Ceramic url provided');
    }
    if (!config.web3analytics_address) {
      throw new VError('No Web3 Analytics address provided');
    }

    const compose = new ComposeClient({
      ceramic: config.ceramic_url,
      definition,
    });
    const provider = new ethers.providers.JsonRpcProvider(config.node_url);

    Web3Analytics.web3analytics = new Web3Analytics(compose, provider, config);
    logger.debug('Created Web3Analytics instance');
    return Web3Analytics.web3analytics;
  }

  async checkConnection(): Promise<void> {
    try {
      //TODO: add check for Ceramic as well
      const network = await this.provider.getNetwork();
      const chainId = network.chainId;
    } catch (err: any) {
      let errorMessage = 'Could not connect to blockchain network. Error: ';
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }
  }

  async getAppIds(): Promise<string[]> {
    const contract = new ethers.Contract(
      this.cfg.web3analytics_address,
      web3AnalyticsABI,
      this.provider
    );
    return await contract.getApps();
  }

  async getUserRegistrations(appId: string): Promise<string[][]> {
    const contract = new ethers.Contract(
      this.cfg.web3analytics_address,
      web3AnalyticsABI,
      this.provider
    );
    return contract.getUserRegistrations(appId);
  }

  verifyRegistration(did: string, ethAddress: string): boolean {
    if (did === null || did === '') return false; //TODO: add check for valid did
    if (!ethers.utils.isAddress(ethAddress)) return false;

    // Decode DID to make sure it matches ethereum address that registered it
    try {
      const toDecode = did.substring(9);
      const u8ak = u8a.fromString(toDecode, 'base58btc');
      const part1 = u8ak.subarray(2, 35);
      const publicKey = ethers.utils.computePublicKey(part1);
      const address = ethers.utils.getAddress(
        ethers.utils.hexDataSlice(
          ethers.utils.keccak256(ethers.utils.hexDataSlice(publicKey, 1)),
          12
        )
      );
      if (address === ethAddress) return true;
    } catch (err: any) {
      let errorMessage = "DID doesn't match ethereum address. Error: ";
      if (err.error_code || err.error_info) {
        errorMessage += `${err.error_code}: ${err.error_info}`;
        throw new VError(errorMessage);
      }
      try {
        errorMessage += err.message ?? err.statusText ?? wrapApiError(err);
      } catch (wrapError: any) {
        errorMessage += wrapError.message;
      }
      throw new VError(errorMessage);
    }

    return false;
  }

  async loadFromGraphQL(did: string, pageSize = 100, cursor) {
    const res: any = await this.composedb.executeQuery(`
      query {
        node (id: "${did}") {
          id  
          ... on CeramicAccount {
            eventList(first: ${pageSize} ${
      cursor ? ` after: "${cursor}"` : ''
    }) {
              edges {
                node {
                  id
                  app_id
                  did
                  created_at
                  updated_at
                  raw_payload
                  anonymousId
                  event
                  meta_ts
                  meta_rid
                  properties_url
                  properties_hash
                  properties_path
                  properties_title
                  properties_width
                  properties_height
                  properties_search
                  properties_referrer
                  traits_email
                  type
                  userId
                  geo_autonomousSystemNumber
                  geo_autonomousSystemOrganization
                  geo_city_geonameId
                  geo_city_name
                  geo_continent_code
                  geo_continent_geonameId
                  geo_continent_name
                  geo_country_geonameId
                  geo_country_isoCode
                  geo_country_name
                  geo_location_accuracyRadius
                  geo_location_latitude
                  geo_location_longitude
                  geo_location_metroCode
                  geo_location_timeZone
                  geo_postal
                  geo_registeredCountry_geonameId
                  geo_registeredCountry_isoCode
                  geo_registeredCountry_name
                  geo_subdivision_geonameId
                  geo_subdivision_isoCode
                  geo_subdivision_name
                  geo_traits_isAnonymous
                  geo_traits_isAnonymousProxy
                  geo_traits_isAnonymousVpn
                  geo_traits_isHostingProvider
                  geo_traits_isLegitimateProxy
                  geo_traits_isPublicProxy
                  geo_traits_isResidentialProxy
                  geo_traits_isSatelliteProvider
                  geo_traits_isTorExitNode
                }
                cursor
              }
              pageInfo {
                endCursor
                hasNextPage
              }
            }
          }
        }
      }    
    `);
    return res.data;
  }

  cleanPayload(data: any) {
    const node = JSON.parse(JSON.stringify(data)); // convert to standard Object
    const payload = {
      id: node.id,
      app_id: node.app_id,
      did: node.did,
      created_at: node.created_at,
      updated_at: node.updated_at,
      raw_payload: node.raw_payload,
    } as any;
    if (node.anonymousId) payload.anonymousId = node.anonymousId;
    if (node.event) payload.event = node.event;
    if (node.meta_ts) payload.meta_ts = node.meta_ts;
    if (node.meta_rid) payload.meta_rid = node.meta_rid;
    if (node.properties_url) payload.properties_url = node.properties_url;
    if (node.properties_hash) payload.properties_hash = node.properties_hash;
    if (node.properties_path) payload.properties_path = node.properties_path;
    if (node.properties_title) payload.properties_title = node.properties_title;
    if (node.properties_referrer)
      payload.properties_referrer = node.properties_referrer;
    if (node.properties_search)
      payload.properties_search = node.properties_search;
    if (node.properties_width) payload.properties_width = node.properties_width;
    if (node.properties_height)
      payload.properties_height = node.properties_height;
    if (node.traits_email) payload.traits_email = node.traits_email;
    if (node.type) payload.type = node.type;
    if (node.userId) payload.userId = node.userId;
    if (node.geo_autonomousSystemNumber)
      payload.geo_autonomousSystemNumber = node.geo_autonomousSystemNumber;
    if (node.geo_autonomousSystemOrganization)
      payload.geo_autonomousSystemOrganization =
        node.geo_autonomousSystemOrganization;
    if (node.geo_city_geonameId)
      payload.geo_city_geonameId = node.geo_city_geonameId;
    if (node.geo_city_name) payload.geo_city_name = node.geo_city_name;
    if (node.geo_continent_code)
      payload.geo_continent_code = node.geo_continent_code;
    if (node.geo_continent_geonameId)
      payload.geo_continent_geonameId = node.geo_continent_geonameId;
    if (node.geo_continent_name)
      payload.geo_continent_name = node.geo_continent_name;
    if (node.geo_country_geonameId)
      payload.geo_country_geonameId = node.geo_country_geonameId;
    if (node.geo_country_isoCode)
      payload.geo_country_isoCode = node.geo_country_isoCode;
    if (node.geo_country_name) payload.geo_country_name = node.geo_country_name;
    if (node.geo_location_accuracyRadius)
      payload.geo_location_accuracyRadius = node.geo_location_accuracyRadius;
    if (node.geo_location_latitude)
      payload.geo_location_latitude = node.geo_location_latitude;
    if (node.geo_location_longitude)
      payload.geo_location_longitude = node.geo_location_longitude;
    if (node.geo_location_metroCode)
      payload.geo_location_metroCode = node.geo_location_metroCode;
    if (node.geo_location_timeZone)
      payload.geo_location_timeZone = node.geo_location_timeZone;
    if (node.geo_postal) payload.geo_postal = node.geo_postal;
    if (node.geo_registeredCountry_geonameId)
      payload.geo_registeredCountry_geonameId =
        node.geo_registeredCountry_geonameId;
    if (node.geo_registeredCountry_isoCode)
      payload.geo_registeredCountry_isoCode =
        node.geo_registeredCountry_isoCode;
    if (node.geo_registeredCountry_name)
      payload.geo_registeredCountry_name = node.geo_registeredCountry_name;
    if (node.geo_subdivision_geonameId)
      payload.geo_subdivision_geonameId = node.geo_subdivision_geonameId;
    if (node.geo_subdivision_isoCode)
      payload.geo_subdivision_isoCode = node.geo_subdivision_isoCode;
    if (node.geo_subdivision_name)
      payload.geo_subdivision_name = node.geo_subdivision_name;
    if (Object.prototype.hasOwnProperty.call(node, 'geo_traits_isAnonymous'))
      payload.geo_traits_isAnonymous = node.geo_traits_isAnonymous;
    if (
      Object.prototype.hasOwnProperty.call(node, 'geo_traits_isAnonymousProxy')
    )
      payload.geo_traits_isAnonymousProxy = node.geo_traits_isAnonymousProxy;
    if (Object.prototype.hasOwnProperty.call(node, 'geo_traits_isAnonymousVpn'))
      payload.geo_traits_isAnonymousVpn = node.geo_traits_isAnonymousVpn;
    if (
      Object.prototype.hasOwnProperty.call(node, 'geo_traits_isHostingProvider')
    )
      payload.geo_traits_isHostingProvider = node.geo_traits_isHostingProvider;
    if (
      Object.prototype.hasOwnProperty.call(node, 'geo_traits_isLegitimateProxy')
    )
      payload.geo_traits_isLegitimateProxy = node.geo_traits_isLegitimateProxy;
    if (Object.prototype.hasOwnProperty.call(node, 'geo_traits_isPublicProxy'))
      payload.geo_traits_isPublicProxy = node.geo_traits_isPublicProxy;
    if (
      Object.prototype.hasOwnProperty.call(
        node,
        'geo_traits_isResidentialProxy'
      )
    )
      payload.geo_traits_isResidentialProxy =
        node.geo_traits_isResidentialProxy;
    if (
      Object.prototype.hasOwnProperty.call(
        node,
        'geo_traits_isSatelliteProvider'
      )
    )
      payload.geo_traits_isSatelliteProvider =
        node.geo_traits_isSatelliteProvider;
    if (Object.prototype.hasOwnProperty.call(node, 'geo_traits_isTorExitNode'))
      payload.geo_traits_isTorExitNode = node.geo_traits_isTorExitNode;

    return payload;
  }

  async *getTrackingEvents(
    did: string,
    lastUpdatedAt?: string
  ): AsyncGenerator<Event> {
    const pageSize = 500;
    let cursor = null;
    let moreResults = true;
    let count = 0;
    while (moreResults) {
      // TODO: use filter to get events > lastUpdatedAt once composedb supports
      const data: any = await this.loadFromGraphQL(did, pageSize, cursor);
      for (const {node} of data.node.eventList.edges) {
        const startTime = new Date(lastUpdatedAt ?? 0);
        if (node.updated_at > startTime) {
          const payload = this.cleanPayload(node);
          count++;
          yield payload as any;
        }
      }
      if (data?.node.eventList.pageInfo?.hasNextPage) {
        cursor = data.node.eventList.edges.slice(-1)[0].cursor;
      } else {
        moreResults = false;
      }
    }

    if (count > 0) console.log(`Processed ${count} events for ${did}`);
  }

  async *getEvents(lastUpdatedAt?: string): AsyncGenerator<Event> {
    const appIds = await this.getAppIds();
    if (!appIds) return;
    //console.log(JSON.stringify(appIds));

    // loop through all appIds
    for await (const appId of appIds) {
      const registrations = await this.getUserRegistrations(appId);

      // loop through all registered users of appId
      for (const registration of registrations) {
        const verified = this.verifyRegistration(
          registration['userDid'],
          registration['userAddress']
        );
        // if user registation is valid, get its tracking events
        if (verified)
          yield* this.getTrackingEvents(registration['userDid'], lastUpdatedAt);
      }
    }
  }
}
