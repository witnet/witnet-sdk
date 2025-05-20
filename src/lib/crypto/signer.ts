const secp256k1 = require('secp256k1')
import * as utils from "../utils"

import { Balance, Network, QueryStakesOrder, StakeEntry } from "../types"
import { IBIP32, IProvider, ISigner } from "./interfaces"
import { Coins, KeyedSignature, PublicKey, PublicKeyHashString, Utxo, UtxoCacheInfo, UtxoSelectionStrategy } from "./types"
import { selectUtxos } from "./utils"

export class Signer implements ISigner {
    
    protected node: IBIP32;
    protected utxos: Array<Utxo> = []
    
    public readonly provider: IProvider
    public strategy: UtxoSelectionStrategy

    constructor(
        node: IBIP32, 
        provider: IProvider, 
        strategy?: UtxoSelectionStrategy,
    ) {
        this.node = node
        this.provider = provider
        this.strategy = strategy || UtxoSelectionStrategy.SlimFit
        if (!provider.network) {
            throw Error(`Signer: internal error: unintialized provider.`)
        }
    }

    // ================================================================================================================
    // --- ILedger ----------------------------------------------------------------------------------------------------

    public get cacheInfo(): UtxoCacheInfo {
        const now = Math.floor(Date.now() / 1000)
        let expendable: bigint = 0n
        let timelock: number = Number.MAX_SAFE_INTEGER
        this.utxos.map(utxo => {
            expendable += utxo.value
            if (utxo.timelock > now && utxo.timelock < timelock) {
                timelock = utxo.timelock
            }
        })
        if (timelock === Number.MAX_SAFE_INTEGER) timelock = 0;
        return { expendable, timelock, size: this.utxos.length }
    }

    public get changePkh(): PublicKeyHashString {
        return this.pkh
    }

    public get network(): Network {
        return this.provider.network || "mainnet"
    }

    public get pkh(): PublicKeyHashString {
        return this.publicKey.hash().toBech32(this.network)
    }

    public get publicKey(): PublicKey {
        return PublicKey.fromUint8Array(this.node.publicKey)
    }

    public addUtxos(...utxos: Array<Utxo>): { excluded: Array<Utxo>, included: Array<Utxo> } {
        const excluded: Array<Utxo> = []
        const existingPointers = new Set(this.utxos.map(cached => cached.output_pointer));
        const included: Array<Utxo> = utxos.filter(utxo => {
            if (utxo.signer === this.pkh) {
                // avoid adding duplicates
                if (!existingPointers.has(utxo.output_pointer)) {
                    existingPointers.add(utxo.output_pointer)
                    return true
                } else {
                    return false
                }
            } else {
                excluded.push(utxo)
                return false;
            }
        })
        this.utxos.push(...included)
        return { excluded, included }
    }

    public consumeUtxos(...utxos: Array<Utxo>): Array<Utxo> {
        this.utxos = this.utxos.filter(cached => {
            const incomingIndex = utxos.findIndex(incoming => cached.output_pointer === incoming.output_pointer);
            if (incomingIndex >= 0) {
                return false
            } else {
                utxos.splice(incomingIndex, 1)
                return true
            }
        })
        return utxos
    }

    public async getBalance(): Promise<Balance> {
        return this.provider.getBalance(this.pkh)
    }

    public async getDelegatees(order?: QueryStakesOrder): Promise<Array<StakeEntry>> {
        return this.provider.stakes({
            filter: { withdrawer: this.pkh },
            params: { order },
        })
    }

    public getSigner(pkh?: PublicKeyHashString): ISigner | undefined { 
        return (!pkh || pkh === this.pkh) ? this : undefined
    }

    public async getUtxos(reload = false): Promise<Array<Utxo>> {
        if (reload) this.utxos = []
        if (this.utxos.length === 0) {
            this.utxos = (await this.provider.getUtxos(this.pkh))
                .map(utxo => ({ ...utxo, signer: this.pkh }))
        }
        return this.utxos
    }

    public async selectUtxos(specs?: {
        value?: Coins,
        reload?: boolean,
        strategy?: UtxoSelectionStrategy
    }): Promise<Array<Utxo>> {
        return this
            .getUtxos(specs?.reload || this.utxos.length === 0)
            .then(utxos => selectUtxos({ utxos, value: specs?.value, strategy: specs?.strategy || this.strategy }))
    }
    
    // ================================================================================================================
    // --- ISigner ----------------------------------------------------------------------------------------------------
    
    public async getStakeEntryNonce(validator: PublicKeyHashString): Promise<number> {
        return this.provider
            .stakes({ filter: {
                validator,
                withdrawer: this.pkh
            }}).then(([entry]) => entry.value.nonce)
    }

    public signHash(hash: any): KeyedSignature {
        let buffer: Buffer;
        if (hash instanceof Uint8Array) {
            buffer = Buffer.from(hash)
        } else if (hash instanceof Buffer) {
            buffer = hash
        } else if (typeof hash === 'string') {
            buffer = Buffer.from(utils.fromHexString(hash))           
        } else {
            throw new Error(`${this.constructor.name}: unsupported hash value: ${hash}`)
        }
        if (!buffer || buffer.length !== 32) {
            throw new Error(`${this.constructor.name}: invalid hash length: ${buffer.length} != 32`)
        } else if (this.node.privateKey) {
            const msg = Uint8Array.from(buffer)
            const privateKey = Uint8Array.from(Buffer.from(this.node.privateKey))
            const signature = secp256k1.ecdsaSign(msg, privateKey).signature
            const der = secp256k1.signatureExport(signature)
            return {
                public_key: {
                    compressed: this.publicKey.compressed,
                    bytes: Array.from(this.publicKey.bytes),
                },
                signature: {
                    Secp256k1: {
                        der: Array.from(der),
                    }
                }
            }
        } else {
            throw Error(`Signer: invalid BIP32 node: no private key`)
        }
    }
}
