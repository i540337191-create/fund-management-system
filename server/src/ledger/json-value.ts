import {isDeepStrictEqual} from 'node:util';
// JSONB may reorder object keys; array order and actual JSON values remain significant.
export function sameJsonValue(a:unknown,b:unknown){
 const json=(v:unknown)=>{const text=JSON.stringify(v);return text===undefined?undefined:JSON.parse(text);};
 return isDeepStrictEqual(json(a),json(b));
}
