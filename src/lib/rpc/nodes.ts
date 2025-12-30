import { default as axios } from "axios";
import { PublicKey, PublicKeyHash, type PublicKeyHashString, RecoverableSignature } from "../crypto/types.js";
import type { Epoch, HexString, Nonce } from "../types.js";
import * as utils from "../utils.js";
import { type IJsonRpcProvider, JsonRpcProvider, JsonRpcProviderError } from "./provider.js";
import {
	type Balance2,
	Methods,
	type NodeStats,
	type PeerAddr,
	type StakeAuthorization,
	type StakeEntry,
	type SupplyInfo2,
	type SyncStatus,
} from "./types.js";

export interface IJsonRpcNodeFarm extends IJsonRpcProvider {
	addresses(): Promise<Record<string, PublicKeyHashString>>;
	balances(): Promise<Record<string, [PublicKeyHashString, Balance2]>>;
	masterKeys(): Promise<Record<string, [PublicKeyHashString, string]>>;
	publicKeys(): Promise<Record<string, [PublicKeyHashString, PublicKey]>>;
	syncStatus(): Promise<Record<string, SyncStatus>>;

	peers(validator?: PublicKeyHashString): Promise<Array<PeerAddr>>;
	stats(): Promise<Record<string, NodeStats>>;
	withdrawers(): Promise<Record<PublicKeyHashString, [bigint, Nonce, number]>>;

	addPeers(peers: Array<string>): Promise<Record<string, boolean>>;
	authorizeStakes(withdrawer: PublicKeyHashString): Promise<Record<string, [PublicKeyHashString, HexString]>>;
	clearPeers(): Promise<Record<string, boolean>>;
	initializePeers(): Promise<Record<string, boolean>>;
	rewind(epoch: Epoch): Promise<Record<string, boolean>>;
	supplyInfo2(): Promise<SupplyInfo2 | undefined>;
}

function isPrivateURL(url: string): boolean {
	const [, host] = utils.parseURL(url);
	return utils.ipIsPrivateOrLocalhost(host.split(":")[0]);
}

export class JsonRpcNodeFarm extends JsonRpcProvider implements IJsonRpcNodeFarm {
	constructor(url?: string) {
		super(url || process.env.WITNET_TOOLKIT_FARM_NODES || "http://127.0.0.1:21339");
		this.endpoints.forEach((url) => {
			if (!isPrivateURL(url)) {
				throw Error(`Witnet.JsonRpcNodeFarm: only local host or private IPs can be provided: ${url}`);
			}
		});
	}

	protected async batchApiPkhMethod<T>(
		method: string,
		params?: any,
	): Promise<Record<string, [PublicKeyHashString, T]>> {
		return this.addresses()
			.then(async (addresses: Record<string, Error | string>) => {
				const promises = Object.entries(addresses).map(async ([url, pkh]) => [
					url,
					[pkh, pkh instanceof Error ? undefined : await this.callApiMethod<T>(url, method, { pkh, ...params })],
				]);
				return Promise.all(promises);
			})
			.then((entries) =>
				Object.fromEntries(
					entries.map(([url, [pkh, value]]) => {
						if (value && value instanceof Error) {
							if ((value as JsonRpcProviderError)?.error?.message) {
								value = new Error((value as JsonRpcProviderError)?.error?.message);
								delete value.stack;
							}
						}
						return [url, [pkh, value || ""]];
					}),
				),
			);
	}

	protected async batchApiPkhMethodNoPkh<T>(
		method: string,
		...params: Array<any>
	): Promise<Record<string, [PublicKeyHashString, T]>> {
		return this.addresses()
			.then(async (addresses: Record<string, Error | string>) => {
				const promises = Object.entries(addresses).map(async ([url, pkh]) => [
					url,
					[pkh, pkh instanceof Error ? undefined : await this.callApiMethod<T>(url, method, params)],
				]);
				return Promise.all(promises);
			})
			.then((entries) =>
				Object.fromEntries(
					entries.map(([url, [pkh, value]]) => {
						if (value && value instanceof Error) {
							if ((value as JsonRpcProviderError)?.error?.message) {
								value = new Error((value as JsonRpcProviderError)?.error?.message);
								delete value.stack;
							}
						}
						return [url, [pkh, value || ""]];
					}),
				),
			);
	}

	protected async batchApiMethod<T>(method: string, params?: Array<any> | any): Promise<Record<string, T>> {
		const promises = this.endpoints.map(async (url) =>
			axios
				.post(
					url,
					{
						jsonrpc: "2.0",
						id: Date.now(),
						method,
						params,
					},
					{
						headers: this._headers,
					},
				)
				.then((response: any) => {
					if (response?.error || response?.data?.error) {
						return [url, new JsonRpcProviderError(method, params, response?.error || response?.data?.error)];
					} else {
						return [url, response?.data?.result as T];
					}
				})
				.catch((exception: any) => {
					const error = new Error(exception?.message || exception?.error || exception);
					delete error.stack;
					return [url, error];
				}),
		);
		return Promise.all(promises).then((values) => Object.fromEntries(values));
	}

	protected async callApiMethod<T>(url: string, method: string, params?: Array<any> | any): Promise<Error | any> {
		return axios
			.post(
				url,
				{
					jsonrpc: "2.0",
					id: Date.now(),
					method,
					params,
				},
				{
					headers: this._headers,
				},
			)
			.then((response: any) => {
				if (response?.error || response?.data?.error) {
					const error = new JsonRpcProviderError(method, params, response?.error || response?.data?.error);
					delete error?.stack;
					return error;
				} else {
					return response?.data?.result as T;
				}
			})
			.catch((exception: any) => {
				const error = new Error(exception?.message || exception?.error || exception);
				delete error?.stack;
				return error;
			});
	}

	/// ---------------------------------------------------------------------------------------------------------------

	public async addresses(): Promise<Record<string, PublicKeyHashString>> {
		return this.batchApiMethod<PublicKeyHashString>(Methods.GetPkh);
	}

	public async balances(): Promise<Record<string, [PublicKeyHashString, Balance2]>> {
		return this.batchApiPkhMethod<Balance2>(Methods.GetBalance2);
	}

	public async masterKeys(): Promise<Record<string, [PublicKeyHashString, string]>> {
		return this.batchApiPkhMethodNoPkh<string>(Methods.MasterKeyExport);
	}

	public async publicKeys(): Promise<Record<string, [PublicKeyHashString, PublicKey]>> {
		return this.batchApiPkhMethodNoPkh<Uint8Array>(Methods.GetPublicKey).then(
			(results: Record<string, [PublicKeyHashString, Error | Uint8Array]>) =>
				Object.fromEntries(
					Object.entries(results).map(([url, [pkh, raw]]) => {
						if (raw && raw instanceof Error) {
							if ((raw as JsonRpcProviderError)?.error?.message) {
								raw = new Error((raw as JsonRpcProviderError)?.error?.message);
								delete raw.stack;
							}
							return [url, [pkh, raw]];
						} else {
							return [url, [pkh, raw ? PublicKey.fromUint8Array(raw) : undefined]];
						}
					}),
				),
		);
	}

	public async peers(): Promise<Array<PeerAddr>> {
		return this.batchApiMethod<Array<PeerAddr>>(Methods.Peers).then((results: Record<string, PeerAddr[]>) => {
			const peers: PeerAddr[] = [];
			Object.values(results).forEach((morePeers: Error | PeerAddr[]) => {
				if (!(morePeers instanceof Error)) {
					morePeers.forEach((peer) => {
						if (!peers.includes(peer)) {
							peers.push(peer);
						}
					});
				}
			});
			return peers;
		});
	}

	public async stats(): Promise<Record<string, NodeStats>> {
		return this.batchApiMethod<NodeStats>(Methods.NodeStats);
	}

	public async syncStatus(): Promise<any> {
		return this.batchApiMethod<SyncStatus>(Methods.SyncStatus);
	}

	public async withdrawers(
		limit?: number,
		offset?: number,
	): Promise<Record<PublicKeyHashString, [bigint, Nonce, number]>> {
		return this.addresses()
			.then(async (addresses: Record<string, Error | string>) => {
				const promises = Object.entries(addresses).map(async ([url, validator]) => [
					url,
					validator instanceof Error
						? undefined
						: await this.callApiMethod<Array<StakeEntry>>(url, Methods.QueryStakes, {
								filter: { validator },
								params: {
									limit,
									offset,
									since: 0,
								},
							}),
				]);
				return Promise.all(promises);
			})
			.then((entries) =>
				Object.fromEntries(
					entries.map(([url, stakes]) => {
						if (stakes && stakes instanceof Error) {
							if ((stakes as JsonRpcProviderError)?.error?.message) {
								stakes = new Error((stakes as JsonRpcProviderError)?.error?.message);
								delete stakes.stack;
							}
							return [url];
						} else {
						}
						return [url, stakes];
					}),
				),
			)
			.then((results: Record<string, Error | Array<StakeEntry>>) => {
				const max = (a: number, b: number) => (a > b ? a : b);
				const withdrawers: Record<PublicKeyHashString, [bigint, Nonce, number]> = {};
				Object.values(results).forEach((moreEntries) => {
					if (moreEntries && !(moreEntries instanceof Error)) {
						moreEntries.forEach((entry) => {
							if (withdrawers[entry.key.withdrawer]) {
								withdrawers[entry.key.withdrawer][0] += entry.value.coins;
								withdrawers[entry.key.withdrawer][1] = max(entry.value.nonce, withdrawers[entry.key.withdrawer][1]);
								withdrawers[entry.key.withdrawer][2] += 1;
							} else {
								withdrawers[entry.key.withdrawer] = [entry.value.coins, entry.value.nonce, 1];
							}
						});
					}
				});
				return Object.fromEntries(
					Object.entries(withdrawers).sort(([, [a, ,]], [, [b, ,]]) => {
						if (a > b) return 1;
						else if (a < b) return -1;
						else return 0;
					}),
				);
			});
	}

	/// ---------------------------------------------------------------------------------------------------------------

	public async addPeers(peers: Array<string>): Promise<Record<string, boolean>> {
		return this.batchApiMethod<boolean>(Methods.AddPeers, peers);
	}

	public async authorizeStakes(
		withdrawer: PublicKeyHashString,
	): Promise<Record<string, [PublicKeyHashString, HexString]>> {
		const msg = PublicKeyHash.fromBech32(withdrawer).toBytes32();
		return this.batchApiPkhMethodNoPkh<StakeAuthorization>(Methods.AuthorizeStake, withdrawer).then(
			(records: Record<string, [PublicKeyHashString, Error | StakeAuthorization]>) =>
				Object.fromEntries(
					Object.entries(records).map(([url, [pkh, authorization]]) => {
						if (authorization && authorization instanceof Error) {
							if ((authorization as JsonRpcProviderError)?.error?.message) {
								authorization = new Error((authorization as JsonRpcProviderError)?.error?.message);
								delete authorization.stack;
							}
							return [url, [pkh, authorization]];
						} else if (authorization) {
							const signature = RecoverableSignature.fromKeyedSignature(authorization.signature, msg);
							const authcode = signature.pubKey.hash().toHexString() + signature.toHexString();
							return [url, [pkh, authcode]];
						} else {
							return [url, [pkh, undefined]];
						}
					}),
				),
		);
	}

	public async clearPeers(): Promise<Record<string, boolean>> {
		return this.batchApiMethod<boolean>(Methods.ClearPeers);
	}

	public async initializePeers(): Promise<Record<string, boolean>> {
		return this.batchApiMethod<boolean>(Methods.InitializePeers);
	}

	public async rewind(epoch: Epoch): Promise<Record<string, boolean>> {
		return this.batchApiMethod<boolean>(Methods.Rewind, [epoch]);
	}

	/// Get supply info
	public async supplyInfo2(): Promise<SupplyInfo2 | undefined> {
		return this.addresses()
			.then(async (addresses: Record<string, Error | string>) => {
				return Promise.all(
					Object.entries(addresses).map(async ([url,]) => {
						return this.callApiMethod<SupplyInfo2>(url, Methods.GetSupplyInfo2)
					})
				).then((supplies: Array<SupplyInfo2>) => {
					return supplies.find(result => !(result instanceof Error))
				})
			})
	}
}
