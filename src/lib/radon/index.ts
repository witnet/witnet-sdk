import { createRequire } from "node:module";
import cbor from "cbor";
import graphQlCompress from "graphql-query-compress";

const require = createRequire(import.meta.url);

import protobuf from "protobufjs";

const { Root: ProtoRoot } = protobuf;
const protoRoot = ProtoRoot.fromJSON(require("../../../witnet/witnet.proto.json"));
const RADRequest = protoRoot.lookupType("RADRequest");

const _DEFAULT_DRY_RUN_TIMEOUT_MSECS = 5000;

import {
	execRadonBytecode,
	fromHexString,
	getWildcardsCountFromString,
	isHexString,
	isWildcard,
	parseURL,
	replaceWildcards,
	spliceWildcard,
	toHexString,
	toUtf8Array,
	utf8ArrayToStr,
} from "../../bin/helpers.js";

import { sha256 } from "../crypto/utils.js";
import { Opcodes as Filters, RadonFilter } from "./filters.js";
import { RadonReducer, Opcodes as Reducers } from "./reducers.js";
import {
	RadonArray as _RadonArray,
	RadonBoolean as _RadonBoolean,
	RadonBytes as _RadonBytes,
	RadonEncodings as _RadonEncodings,
	RadonFloat as _RadonFloat,
	RadonInteger as _RadonInteger,
	RadonMap as _RadonMap,
	RadonScript as _RadonScript,
	RadonString as _RadonString,
	type RadonAny,
	type RadonOperator,
	type RadonString,
} from "./types.js";
import { parseRadonScript } from "./utils.js";

type Args = string[] | string[][];

class RadonArtifact {
	public readonly sources: RadonRetrieval[];
	public readonly sourcesReducer: RadonReducer;
	public readonly witnessReducer: RadonReducer;

	constructor(specs: {
		sources: RadonRetrieval[];
		sourcesReducer: RadonReducer;
		witnessReducer: RadonReducer;
	}) {
		if (!specs.sources || !Array.isArray(specs.sources) || specs.sources.length === 0) {
			throw TypeError("RadonArtifact: cannot build if no retrievals are passed");
		}
		specs.sources?.forEach((retrieval, index) => {
			if (retrieval === undefined) {
				throw TypeError(`RadonArtifact: retrieval #${index} is undefined`);
			} else if (!(retrieval instanceof RadonRetrieval)) {
				throw TypeError(`RadonArtifact: retrieval #${index}: invalid type`);
			}
		});
		this.sources = specs.sources;
		this.sourcesReducer = specs.sourcesReducer;
		this.witnessReducer = specs.witnessReducer;
	}

	public opsCount(): number {
		return (
			(this.sources?.map((retrieval) => retrieval.opsCount()).reduce((sum, a) => sum + a) || 0) +
			this.sourcesReducer?.opsCount() +
			this.witnessReducer?.opsCount()
		);
	}
}

export class RadonRequest extends RadonArtifact {
	/**
	 * Decodes a RadonRequest artifact out from a Protobuf-serialized bytecode.
	 * @param bytecode Radon request bytecode.
	 * @returns RadonRequest object.
	 */
	public static fromBytecode(bytecode: any) {
		let buffer;
		if (isHexString(bytecode)) {
			buffer = fromHexString(bytecode);
		} else if (bytecode instanceof Uint8Array) {
			buffer = Buffer.from(bytecode);
		} else if (bytecode instanceof Buffer) {
			buffer = bytecode;
		} else {
			throw new TypeError(`RadonRequest: unsupported bytecode format: ${bytecode}`);
		}
		const obj: any = RADRequest.decode(buffer);
		return RadonRequest.fromProtobuf(obj);
	}

	/**
	 * Decodes a RadonRequest artifact out from a Protobuf object.
	 * @param obj Protobuf object.
	 * @returns RadonRequest object.
	 */
	public static fromProtobuf(obj: any) {
		const sources = obj.retrieve.map((retrieval: any) => {
			const specs: any = {};
			if (retrieval?.url) {
				specs.url = retrieval.url;
			}
			if (retrieval?.headers) {
				specs.headers = Object.fromEntries(
					retrieval.headers.map((stringPair: any) => [stringPair.left, stringPair.right]),
				);
			}
			if (retrieval?.body && retrieval.body.length > 0) {
				specs.body = utf8ArrayToStr(Object.values(retrieval.body));
			}
			if (retrieval?.script) specs.script = parseRadonScript(toHexString(retrieval.script));
			specs.method = retrieval.kind;
			return new RadonRetrieval(specs);
		});
		const decodeFilter = (f: any) => {
			if (f?.args && f.args.length > 0) return new RadonFilter(f.op, cbor.decode(Uint8Array.from(f.args)));
			else return new RadonFilter(f.op);
		};
		return new RadonRequest({
			sources,
			sourcesReducer: new RadonReducer(obj.aggregate.reducer, obj.aggregate.filters?.map(decodeFilter)),
			witnessReducer: new RadonReducer(obj.tally.reducer, obj.tally.filters?.map(decodeFilter)),
		});
	}

	constructor(specs: {
		sources: RadonRetrieval | RadonRetrieval[];
		sourcesReducer?: RadonReducer;
		witnessReducer?: RadonReducer;
	}) {
		const sources = Array.isArray(specs.sources) ? (specs.sources as RadonRetrieval[]) : [specs.sources];
		super({
			sources,
			sourcesReducer: specs?.sourcesReducer || reducers.Mode(),
			witnessReducer: specs?.witnessReducer || reducers.Mode(),
		});
		const argsCount = sources.map((retrieval) => retrieval.argsCount).reduce((prev, curr) => prev + curr);
		if (argsCount > 0) {
			throw TypeError("RadonRequest: parameterized retrievals were passed");
		}
	}

	protected _encode(): Buffer {
		const payload = this.toProtobuf();
		const errMsg = RADRequest.verify(payload);
		if (errMsg) {
			throw Error(errMsg);
		} else {
			const message = RADRequest.fromObject(payload);
			return Buffer.from(RADRequest.encode(message).finish());
		}
	}

	public async execDryRun(options?: { verbose: boolean; timeout: number }): Promise<string> {
		return execRadonBytecode(
			this.toBytecode(),
			options?.timeout ?? _DEFAULT_DRY_RUN_TIMEOUT_MSECS,
			"--json",
			options?.verbose ? "--verbose" : "",
		).then((result) => result.trim());
	}

	public get dataType(): string {
		return this.sources[0].method === retrievals.Methods.RNG
			? "RadonBytes"
			: this.sources?.[0]?.script?.outputType
				? this.sources[0].script.outputType.constructor.name
				: "RadonAny";
	}

	public get radHash(): string {
		return toHexString(sha256(this._encode()), false);
	}

	public toBytecode(): string {
		return toHexString(this._encode()); //encodeRADRequest(this.toProtobuf()), true)
	}

	public toJSON(humanize?: boolean): any {
		return {
			retrieve: this.sources.map((retrieval) => retrieval.toJSON(humanize)),
			aggregate: this.sourcesReducer.toJSON(humanize),
			tally: this.witnessReducer.toJSON(humanize),
			...(humanize ? {} : { time_lock: 0 }),
		};
	}

	public toProtobuf(): any {
		return {
			//timeLock: 0,
			retrieve: this.sources.map((retrieval) => retrieval.toProtobuf()),
			aggregate: this.sourcesReducer.toProtobuf(),
			tally: this.witnessReducer.toProtobuf(),
		};
	}

	public weight(): number {
		return this.toBytecode().slice(2).length / 2;
	}
}

export function RadonRequestFromAssets(specs: {
	assets: Object;
	argsMap: Record<string, any | string[] | undefined>;
	sourcesReducer?: RadonReducer;
	witnessReducer?: RadonReducer;
}): RadonRequest {
	const sources: RadonRetrieval[] = [];
	const dict = retrievals.fromRadonAssets(specs.assets);
	// const args: string[][] = []
	Object.keys(specs.argsMap).forEach((key) => {
		const retrieval: RadonRetrieval = dict[key];
		const args = (specs.argsMap as any)[key];
		if (retrieval.argsCount > 0) {
			if (!args || args.length < retrieval.argsCount) {
				throw TypeError(
					`Insufficient args passed to retrieval named as '${key}': ${args.length} < ${retrieval.argsCount}`,
				);
			} else {
				sources.push(retrieval.foldArgs(args));
			}
		} else {
			sources.push(retrieval);
		}
	});
	return new RadonRequest({
		sources,
		sourcesReducer: specs?.sourcesReducer,
		witnessReducer: specs?.witnessReducer,
	});
}

export function RadonScript<InputType extends RadonAny = RadonString>(inputType: {
	new (ops?: RadonOperator): InputType;
}): InputType {
	if (!inputType) throw TypeError("Input Radon data type must be specified when declaring a new Radon script.");
	return new inputType();
}

export class RadonTemplate extends RadonArtifact {
	protected _argsCount: number;

	public readonly homogeneous: boolean;
	public readonly samples?: Record<string, Args>;

	constructor(
		specs: {
			sources: RadonRetrieval | RadonRetrieval[];
			sourcesReducer?: RadonReducer;
			witnessReducer?: RadonReducer;
		},
		samples?: Record<string, Args>,
	) {
		const sources = Array.isArray(specs.sources) ? (specs.sources as RadonRetrieval[]) : [specs.sources];
		super({
			sources,
			sourcesReducer: specs?.sourcesReducer || reducers.Mode(),
			witnessReducer: specs?.witnessReducer || reducers.Mode(),
		});
		this._argsCount = sources.map((retrieval) => retrieval?.argsCount).reduce((prev, curr) => Math.max(prev, curr), 0);
		if (this._argsCount === 0) {
			throw TypeError("RadonTemplate: no parameterized retrievals were passed");
		}
		this.homogeneous = !sources.find((retrieval) => retrieval.argsCount !== this._argsCount);
		if (samples) {
			Object.keys(samples).forEach((sample) => {
				let sampleArgs: Args = Object(samples)[sample];
				if (typeof sampleArgs === "string") {
					sampleArgs = [sampleArgs];
				}
				if (sampleArgs.length > 0) {
					if (!Array.isArray(sampleArgs[0])) {
						Object(samples)[sample] = Array(sources.length).fill(sampleArgs);
						sampleArgs = Object(samples)[sample];
					} else if (sampleArgs?.length !== sources.length) {
						throw TypeError(
							`RadonTemplate: arguments mismatch in sample "${sample}": ${sampleArgs?.length} samples given vs. ${sources.length} expected`,
						);
					}
					sampleArgs?.forEach((subargs, index) => {
						if (subargs.length < sources[index].argsCount) {
							throw TypeError(
								`\x1b[1;33mRadonRequestTemplate: arguments mismatch in test \x1b[1;31m'${sample}'\x1b[1;33m: \x1b[1;37mRetrieval #${index}\x1b[1;33m: ${subargs?.length} parameters given vs. ${sources[index].argsCount} expected\x1b[0m`,
							);
						}
					});
				}
			});
			this.samples = samples;
		}
	}

	public get argsCount(): number {
		return this._argsCount;
	}

	public buildRadonRequest(args: any | any[] | string[] | string[][]): RadonRequest {
		const sources: RadonRetrieval[] = [];
		if (this.homogeneous) {
			// args can be either any, string[] or string[0][]
			if (Array.isArray(args) && args[0] && Array.isArray(args[0])) {
				if (args.length > 1) {
					throw new TypeError(`RadonTemplate: homogeneous template: args vector dimension ${args.length} > 1.`);
				}
				args = args[0];
			} else if (Array.isArray(args) && args.length !== this.argsCount) {
				throw new TypeError(
					`RadonTemplate: homogenous template: missing ${this.argsCount - args.length} out of ${args.length} parameters.`,
				);
			}
			this.sources.forEach((retrieval) => {
				sources.push(retrieval.foldArgs(args));
			});
		} else {
			if (!Array.isArray(args) || args.length !== this.sources.length) {
				throw new TypeError(`RadonTemplate: args vector dimension ${args.length} != ${this.sources.length}`);
			}
			this.sources.forEach((retrieval, index) => {
				if (Array.isArray(args[index]) && retrieval.argsCount !== args[index].length) {
					throw new TypeError(
						`RadonTemplate: retrieval #${index + 1}: mismatching args count: ${
							args[index].length
						} != ${retrieval.argsCount} ([${args[index]})]`,
					);
				}
				sources.push(retrieval.foldArgs(args[index]));
			});
		}
		return new RadonRequest({
			sources,
			sourcesReducer: this.sourcesReducer,
			witnessReducer: this.witnessReducer,
		});
	}
}

export class RadonModal extends RadonTemplate {
	protected _providers: Array<string>;

	constructor(specs: {
		providers?: Array<string>;
		retrieval: RadonRetrieval;
		sourcesReducer?: RadonReducer;
		witnessReducer?: RadonReducer;
	}) {
		if (!specs.retrieval.isModal()) {
			throw TypeError("RadonModal: no modal retrieval was passed.");
		}
		super(
			{
				sources: [specs.retrieval],
				sourcesReducer: specs?.sourcesReducer || reducers.Mode(),
				witnessReducer: specs?.witnessReducer || reducers.Mode(),
			},
			specs.retrieval?.samples,
		);
		if (specs?.providers) {
			this._providers = this._checkProviders(specs.providers);
		} else {
			this._providers = [];
		}
	}

	public get argsCount(): number {
		const _providersArgsCount = Math.max(...this.providers.map((url) => getWildcardsCountFromString(url)));
		return _providersArgsCount > 0 ? Math.max(this._argsCount, _providersArgsCount) : this._argsCount;
	}

	public get providers(): Array<string> {
		return this._providers;
	}

	public set providers(providers: Array<string>) {
		this._providers = this._checkProviders(providers);
	}

	public buildRadonRequest(args?: any | string[]): RadonRequest {
		if (this.providers.length === 0) {
			throw new TypeError(`RadonModal: no providers were previously settled.`);
		}
		const template = this.buildRadonTemplate(this.providers);
		return template.homogeneous
			? template.buildRadonRequest(args)
			: template.buildRadonRequest(template.sources.map((source) => args.slice(0, source.argsCount)));
	}

	public buildRadonTemplate(providers?: Array<string>): RadonTemplate {
		if (!providers) {
			providers = this._checkProviders([...this._providers]);
		} else {
			providers = this._checkProviders([...providers]);
		}
		if (!providers || providers.length === 0) {
			throw new TypeError(`RadonModal: no providers were specified.`);
		}
		return new RadonTemplate({
			sources: this.sources[0].spawnRetrievals(...providers),
			sourcesReducer: this.sourcesReducer,
			witnessReducer: this.witnessReducer,
		});
	}

	_checkProviders(providers: Array<string>): Array<string> {
		providers.forEach((provider) => {
			const [schema] = parseURL(provider);
			if (!schema.startsWith("http://") && !schema.startsWith("https://")) {
				throw TypeError(`RadonModal: invalid provider: ${provider}`);
			}
		});
		return providers;
	}
}

export class RadonRetrieval {
	public readonly argsKeys?: Array<string>;
	public readonly argsCount: number;
	public readonly method: retrievals.Methods;
	public readonly authority?: string;
	public readonly body?: any;
	public readonly headers?: Record<string, string>;
	public readonly path?: string;
	public readonly query?: string;
	public readonly schema?: string;
	public readonly script?: _RadonScript;
	public readonly url?: string;

	public readonly samples?: Record<string, string[]>;

	constructor(
		specs: {
			method: retrievals.Methods;
			url?: string;
			headers?: Record<string, string>;
			body?: any;
			script?: RadonAny;
			argsKeys?: Array<string>;
		},
		samples?: Record<string, string[]>,
	) {
		if (specs.method === retrievals.Methods.RNG && (specs?.url || specs?.headers?.size || specs?.body)) {
			throw TypeError("RadonRetrieval: RNG accepts no URLs or headers");
			// } else if (!specs?.url && (method == Methods.HttpPost || method == Methods.HttpGet)) {
			//     throw TypeError("RadonRetrieval: URL must be specified");
		} else if (specs?.body && specs.method === retrievals.Methods.HttpGet) {
			throw TypeError("RadonRetrieval: body cannot be specified in HTTP-GET queries");
		}
		this.method = specs.method;
		if (specs?.url) {
			this.url = specs.url;
			if (!isWildcard(specs.url)) {
				try {
					const parts = parseURL(specs.url);
					this.schema = parts[0];
					if (parts[1] !== "") this.authority = parts[1];
					if (parts[2] !== "") this.path = parts[2];
					if (parts[3] !== "") this.query = parts[3];
				} catch {}
			}
		} else if (
			specs.method === retrievals.Methods.HttpGet ||
			specs.method === retrievals.Methods.HttpPost ||
			specs.method === retrievals.Methods.HttpHead
		) {
			this.url = "\\0\\";
		}
		if (specs?.headers) {
			if (typeof specs.headers !== "object" || Array.isArray(specs.headers)) {
				throw new TypeError("RadonRetrieval: HTTP headers must be of type Record<string, string>");
			}
			this.headers = specs?.headers;
		}
		this.body = specs?.body;
		if (specs?.script) this.script = new _RadonScript(specs?.script);
		this.argsCount = Math.max(
			getWildcardsCountFromString(this?.url),
			getWildcardsCountFromString(this?.body),
			...(Object.keys(this?.headers || {}).map((key) => getWildcardsCountFromString(key)) ?? []),
			...(Object.values(this?.headers || {}).map((value) => getWildcardsCountFromString(value)) ?? []),
			this.script?.argsCount() || 0,
		);
		if (samples && this.argsCount === 0) {
			throw new TypeError("RadonRetrieval: passed samples to non-parameterized retrieval.");
		}
		this.samples = samples;
		if (specs?.argsKeys) {
			if (this.argsCount === 0) {
				throw new TypeError("RadonRetrieval: passed args keys to non-parameterized retrieval");
			} else if (specs.argsKeys.length !== this.argsCount) {
				throw new TypeError(
					`RadonRetrieval: passed invalid number of args keys: ${specs.argsKeys.length} != ${this.argsCount}`,
				);
			}
			this.argsKeys = specs.argsKeys;
		}
	}

	public isModal(): boolean {
		return this.method !== retrievals.Methods.RNG && (!this.url || this.url === "\\0\\");
	}

	public isParameterized(): boolean {
		return this.argsCount > 0;
	}

	/**
	 * Creates a new Radon Retrieval by orderly replacing indexed wildcards with given parameters.
	 * Fails if not parameterized, of if passing too many parameters.
	 */
	public foldArgs(args: any | string[]): RadonRetrieval {
		if (this.argsCount === 0) {
			return this; //throw new TypeError(`RadonRetrieval: cannot fold unparameterized retrieval`)
		}
		const params: string[] = [];
		if (Array.isArray(args)) {
			if ((args as any[]).length > this.argsCount) {
				throw new TypeError(`RadonRetrieval: too may args passed: ${args.length} > ${this.argsCount}`);
			}
			params.push(...(args as string[]));
		} else if (typeof args === "object") {
			if (!this.argsKeys) {
				throw new TypeError(`RadonRetrieval: unexpected args map: undefined args keys.`);
			} else {
				this.argsKeys.forEach((key) => {
					if (!args[key]) {
						throw new TypeError(`RadonRetrieval: missing value for parameter "${key}".`);
					}
					params.push(args[key] as string);
				});
			}
		} else {
			params.push(args as string);
		}
		return new RadonRetrieval({
			method: this.method,
			url: replaceWildcards(this.url, params),
			body: replaceWildcards(this.body, params),
			headers: Object.fromEntries(
				Object.entries(this.headers || {}).map(([key, value]) => [
					replaceWildcards(key, params),
					replaceWildcards(value, params),
				]),
			),
			script: this.script?.replaceWildcards(...params),
		});
	}

	/**
	 * Creates one or more clones of this retrieval, in which the index-0 wildcard
	 * will be replaced by the given values. Fails if the retrieval is not parameterized.
	 */
	public spawnRetrievals(...values: string[]): RadonRetrieval[] {
		const _spawned: RadonRetrieval[] = [];
		if (this.isModal()) {
			values.forEach((url) => {
				_spawned.push(
					new RadonRetrieval({
						argsKeys: this.argsKeys,
						body: this.body,
						headers: this.headers,
						method: this.method,
						script: this.script?.clone(),
						url,
					}),
				);
			});
		} else {
			if (this.argsCount === 0) {
				throw new TypeError(`RadonRetrieval: cannot spawn from unparameterized retrieval`);
			}
			values.forEach((value) => {
				_spawned.push(
					new RadonRetrieval({
						method: this.method,
						url: spliceWildcard(this.url, 0, value, this.argsCount),
						body: spliceWildcard(this.body, 0, value, this.argsCount),
						headers: Object.fromEntries(
							Object.entries(this.headers || {}).map(([headerKey, headerValue]) => [
								spliceWildcard(headerKey, 0, value, this.argsCount),
								spliceWildcard(headerValue, 0, value, this.argsCount),
							]),
						),
						script: this.script?.spliceWildcard(0, value),
						argsKeys: this.argsKeys?.slice(1),
					}),
				);
			});
		}
		return _spawned;
	}

	public toJSON(humanize?: boolean): any {
		const kind = ["", "HTTP-GET", "RNG", "HTTP-POST", "HTTP-HEAD"];
		const json: any = {
			kind: kind[this.method], // humanize ? Methods[this.method] : this.method,
		};
		if (this.url) json.url = this.url;
		if (this.headers) {
			json.headers = Object.entries(this.headers);
		}
		if (this.body) {
			if (typeof this.body === "string") {
				json.body = humanize ? this.body : toUtf8Array(this.body);
			} else {
				json.body = this.body;
			}
		}
		json.script = humanize ? this.script?.toString() : Array.from(fromHexString(this.script?.toBytecode() || "0x80"));
		return json;
	}

	public toProtobuf(): any {
		const protobuf: any = {
			kind: this.method,
		};
		if (this.url) protobuf.url = this.url;
		if (this.headers) {
			protobuf.headers = Object.entries(this.headers).map(([headerKey, headerValue]) => {
				return {
					left: headerKey,
					right: headerValue,
				};
			});
		}
		if (this.body) {
			const utf8Array = toUtf8Array(this.body);
			protobuf.body = utf8Array;
		}
		protobuf.script = Object.values(Uint8Array.from(cbor.encode(this.script?.encode() || [])));
		return protobuf;
	}

	public opsCount(): any {
		return this._countOps(this.script?.encode() || []);
	}

	protected _countOps(items: any[]): number {
		return items.length > 0
			? items.map((item) => (Array.isArray(item) ? this._countOps(item) : 1)).reduce((sum, a) => sum + a)
			: 0;
	}
}

export namespace filters {
	export const Opcodes = Filters;
	export const Class = RadonFilter;
	export function Mode() {
		return new RadonFilter(Filters.Mode);
	}
	export function Stdev(stdev: number) {
		return new RadonFilter(Filters.StandardDeviation, stdev);
	}
}

export namespace reducers {
	export const Opcodes = Reducers;
	export const Class = RadonReducer;
	export function Mode(...filters: RadonFilter[]) {
		return new RadonReducer(Reducers.Mode, filters);
	}
	export function Mean(...filters: RadonFilter[]) {
		return new RadonReducer(Reducers.MeanAverage, filters);
	}
	export function Median(...filters: RadonFilter[]) {
		return new RadonReducer(Reducers.MedianAverage, filters);
	}
	export function Stdev(...filters: RadonFilter[]) {
		return new RadonReducer(Reducers.StandardDeviation, filters);
	}
	export function ConcatHash(...filters: RadonFilter[]) {
		return new RadonReducer(Reducers.ConcatenateAndHash, filters);
	}

	export function PriceAggregate() {
		return new RadonReducer(Reducers.MeanAverage, [filters.Stdev(1.4)]);
	}
	export function PriceTally() {
		return new RadonReducer(Reducers.MeanAverage, [filters.Stdev(2.5)]);
	}
}

import * as ccdr from "./ccdr/index.js";
export namespace retrievals {
	export const rpc = ccdr;

	export function fromRadonAssets(assets: Object): Record<string, RadonRetrieval> {
		return new Proxy(assets, proxyHandler(RadonRetrieval));
	}

	export enum Methods {
		None = 0x0,
		HttpGet = 0x01,
		HttpHead = 0x04,
		HttpPost = 0x03,
		RNG = 0x02,
	}

	/**
	 * Creates a Witnet randomness data source object.
	 * @param script (Optional) Radon Script to apply to the random seed proposed by every single witness,
	 * before aggregation.
	 **/
	export function RNG(script?: RadonAny) {
		const retrieval = new RadonRetrieval({ method: Methods.RNG, script });
		if (retrieval?.script && retrieval?.script?.inputType?.constructor.name !== "RadonBytes") {
			throw new TypeError("RNG scripts require [RadonBytes] as input type");
		}
		return retrieval;
	}

	/**
	 * Creates a HTTP/GET data retrieval object.
	 * @param specs Radon Retrieval specs.
	 **/
	export function HttpGet(specs: {
		/**
		 * HTTP request URL.
		 */
		url?: string;
		/**
		 * HTTP request headers.
		 */
		headers?: Record<string, string>;
		/**
		 * RadonScript for processing returned value.
		 */
		script?: RadonAny;
		/**
		 * Names of indexed parameters (optional, if any).
		 */
		argsKeys?: string[];
		/**
		 * Map of pre-set parameters (on parameterized retrievals, only).
		 */
		samples?: Record<string, string[]>;
	}) {
		return new RadonRetrieval(
			{
				method: Methods.HttpGet,
				url: specs?.url,
				headers: specs?.headers,
				script: specs?.script,
				argsKeys: specs?.argsKeys,
			},
			specs?.samples,
		);
	}

	/**
	 * Creates a HTTP/HEAD data retrieval object.
	 * @param specs Radon Retrieval specs.
	 **/
	export function HttpHead(specs: {
		/**
		 * HTTP request URL
		 */
		url?: string;
		/**
		 * HTTP request headers
		 */
		headers?: Record<string, string>;
		/**
		 * Radon script for processing returned value.
		 */
		script?: RadonAny;
		/**
		 * Names of indexed parameters (optional, if any)
		 */
		argsKeys?: string[];
		/**
		 * Map of pre-set parameters (on parameterized retrievals, only).
		 */
		samples?: Record<string, string[]>;
	}) {
		return new RadonRetrieval(
			{
				method: Methods.HttpHead,
				url: specs?.url,
				headers: specs?.headers,
				script: specs?.script,
				argsKeys: specs?.argsKeys,
			},
			specs?.samples,
		);
	}

	/**
	 * Creates a HTTP/POST data retrieval object.
	 * @param specs Radon Retrieval specs.
	 **/
	export function HttpPost(specs: {
		/**
		 * HTTP request URL
		 */
		url?: string;
		/**
		 * HTTP request body
		 */
		body?: string;
		/**
		 * HTTP request headers
		 */
		headers?: Record<string, string>;
		/**
		 * Radon script for processing returned value.
		 */
		script?: RadonAny;
		/**
		 * Names of indexed parameters (optional, if any)
		 */
		argsKeys?: string[];
		/**
		 * Map of pre-set parameters (on parameterized retrievals, only).
		 */
		samples?: Record<string, string[]>;
	}) {
		return new RadonRetrieval(
			{
				method: Methods.HttpPost,
				url: specs?.url,
				headers: specs?.headers,
				body: specs?.body,
				script: specs?.script,
				argsKeys: specs?.argsKeys,
			},
			specs?.samples,
		);
	}

	/**
	 * Creates a GraphQL-query data source object.
	 * @param specs Radon Retrieval specs.
	 **/
	export function GraphQLQuery(specs: {
		/**
		 * GraphQL URL endpoint
		 */
		url?: string;
		/**
		 * GraphQL query
		 */
		query: string;
		/**
		 * Radon script for processing returned value.
		 */
		script?: RadonAny;
		/**
		 * Names of indexed parameters (optional, if any)
		 */
		argsKeys?: string[];
		/**
		 * Map of pre-set parameters (on parameterized retrievals, only).
		 */
		samples?: Record<string, string[]>;
	}) {
		return new RadonRetrieval(
			{
				method: Methods.HttpPost,
				url: specs.url,
				body: `{"query":"${graphQlCompress(specs.query).replaceAll('"', '\\"')}"}`,
				headers: { "Content-Type": "application/json;charset=UTF-8" },
				script: specs?.script,
				argsKeys: specs?.argsKeys,
			},
			specs?.samples,
		);
	}

	/**
	 * Creates a JSON-RPC data retrieval object.
	 * @param specs Radon Retrieval specs.
	 **/
	export function JsonRPC(specs: {
		/**
		 * JSON-RPC method and parameters.
		 */
		rpc: { method: string; params?: any };
		/**
		 * Radon script for processing returned value.
		 */
		script?: RadonAny;
		/**
		 * Names of indexed parameters (optional, if any)
		 */
		argsKeys?: string[];
		/**
		 * Map of pre-set parameters (on parameterized retrievals, only).
		 */
		samples?: Record<string, string[]>;
	}) {
		return new RadonRetrieval(
			{
				method: retrievals.Methods.HttpPost,
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: specs.rpc.method,
					params: specs.rpc?.params,
					id: 1,
				}).replaceAll("\\\\", "\\"),
				headers: { "Content-Type": "application/json;charset=UTF-8" },
				script: specs?.script,
				argsKeys: specs?.argsKeys,
			},
			specs?.samples,
		);
	}
}
export namespace types {
	export const RadonArray = _RadonArray;
	export const RadonBoolean = _RadonBoolean;
	export const RadonBytes = _RadonBytes;
	export const RadonFloat = _RadonFloat;
	export const RadonInteger = _RadonInteger;
	export const RadonMap = _RadonMap;
	export const RadonScript = _RadonScript;
	export const RadonString = _RadonString;
	export const RadonEncodings = _RadonEncodings;
}

function proxyHandler<T>(t: { new (specs: any): T }) {
	return {
		get(target: any, prop: string) {
			const found = target[prop] ?? findKeyInObject(target, prop);
			// if (!found) {
			//     throw EvalError(`['${prop}'] was not found in dictionary`)
			// } else
			if (found && !(found instanceof t)) {
				throw TypeError(`['${prop}'] was found with type ${found?.constructor?.name} instead of ${t.name}!`);
			}
			return found;
		},
	};
}

function findKeyInObject(dict: any, tag: string) {
	for (const key in dict) {
		if (typeof dict[key] === "object") {
			if (key === tag) {
				return dict[key];
			} else {
				const found: any = findKeyInObject(dict[key], tag);
				if (found) return found;
			}
		}
	}
}
