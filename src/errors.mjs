export class ToolError extends Error {
  constructor(code,status=0){super('No se pudo completar la operación.');this.name='ToolError';this.code=code;this.status=status;}
}
export function ensure(value,code='INVALID_RESPONSE'){if(!value)throw new ToolError(code);}
export function safeError(error){return error instanceof ToolError?`${error.code} (HTTP ${error.status})`:'UNEXPECTED_ERROR';}
