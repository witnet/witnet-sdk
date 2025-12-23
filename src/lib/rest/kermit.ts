import { default as axios } from "axios";
import { default as jsonBig } from "json-bigint";
import type {
	GetDataRequestEtherealReport,
	GetDataRequestFullReport,
	GetDataRequestMode,
	Hash,
	SyncStatus,
} from "../types.js";
import { parseURL } from "../utils.js";

import type { DataPushReport } from "./types.js";

const stringify = (query: any) =>
	Object.entries(query)
		.map(([key, value]) => `&${key}=${value}`)
		.join("")
		.slice(1);

interface IKermitClient {
	getDataPushReport(witDrTxHash: Hash, evmNetwork?: number | string): Promise<DataPushReport>;
	getSyncStatus(isMainnet: boolean): Promise<SyncStatus>;
	searchDataRequests(
		radHash: Hash,
		isMainnet: boolean,
		options?: any,
	): Promise<Array<GetDataRequestEtherealReport | GetDataRequestFullReport>>;
}

export class KermitError extends Error {
	readonly error?: any;
	readonly path: string;
	readonly query?: any;
	constructor(path: string, query?: any, error?: any) {
		super(`${path}${stringify(query)}: ${JSON.stringify(error)}`);
		delete error?.stack;
		this.error = error;
		this.path = path;
		this.query = query;
	}
}

export class KermitClient implements IKermitClient {
	static async fromEnv(url?: string): Promise<KermitClient> {
		return new KermitClient(url || process.env.WITNET_SDK_KERMIT_URL || "https://kermit.witnet.io");
	}

	public readonly url: string;

	constructor(url: string) {
		const [schema] = parseURL(url);
		if (!schema.startsWith("http://") && !schema.startsWith("https://")) {
			throw Error(`KermitClient: unsupported URL schema ${schema}`);
		}
		this.url = url;
		if (!this.url.endsWith("/")) {
			this.url += "/";
		}
		if (!this.url.endsWith("api/")) {
			this.url += "api/";
		}
	}

	protected async callApiGetMethod<T>(path: string, query?: any): Promise<Error | any> {
		const url = `${this.url}${path}${query ? `?${stringify(query)}` : ""}`;
		return axios
			.get(url, {
				transformResponse: (response) => jsonBig().parse(response),
			})
			.then((response: any) => {
				if (response?.error || response?.data?.error) {
					throw new KermitError(path, query, response?.error || response?.data?.error);
				} else if (response?.statusCode && response.statusCode !== 200) {
					throw new KermitError(path, query, `server status code: HTTP/${response.statusCode}`);
				} else {
					return response?.data as T;
				}
			})
			.catch((error) => {
				throw new KermitError(path, query, error);
			});
	}

	public async getDataPushReport(witDrTxHash: Hash, evmNetwork?: number | string): Promise<DataPushReport> {
		return this.callApiGetMethod<DataPushReport>("get_data_push_report", {
			witDrTxHash,
			evmNetwork,
		});
	}

	public async getSyncStatus(isMainnet: boolean): Promise<SyncStatus> {
		return this.callApiGetMethod<SyncStatus>("sync_status", { isMainnet });
	}

	public async searchDataRequests(
		radHash: Hash,
		isMainnet: boolean,
		options?: {
			limit?: number;
			offset?: number;
			mode?: GetDataRequestMode;
			reverse?: boolean;
		},
	): Promise<Array<GetDataRequestEtherealReport | GetDataRequestFullReport>> {
		return this.callApiGetMethod<Array<GetDataRequestEtherealReport | GetDataRequestFullReport>>(
			"search_data_requests",
			{
				radHash,
				isMainnet,
				...options,
			},
		);
	}
}
