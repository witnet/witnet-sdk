import { checkRpcWildcards, isHexStringOfLength, isWildcard } from "../../../bin/helpers"
import { Bytes32, Wildcard } from ".";

export type WitAddress = string & {
    readonly WitAddress: unique symbol
}

/**
 * Retrieve the balance in $nanoWIT of some account in Witnet.
 * @param address Address of the account within the Witnet blockchain.
 */
export const getBalance = (address: WitAddress | Wildcard) => {
    checkRpcWildcards(address)
    if (
        !isWildcard(address) && (
            !address || typeof address !== "string" || address.length != 43 || !address.startsWith("wit")
        ) 
    ) {
        throw new EvalError("rpc.wit.getBalance: invalid address");
    }
    return {
        method: "getBalance2", 
        params: { pkh: address },
    };
};

/**
 * Retrieve detailed informatinon about a mined transaction in the Witnet blockchain.
 * @param txHash The hash of the transaction to retrieve.
 */
export const getTransaction = (txHash: Bytes32 | Wildcard) => {
    checkRpcWildcards(txHash)
    if (!isHexStringOfLength(txHash, 32) && !isWildcard(txHash)) {
        throw new EvalError("rpc.wit.getTransaction: invalid transaction hash value");
    }
    return {
        method: "getTransaction", 
        params: [ txHash ]
    };
}
