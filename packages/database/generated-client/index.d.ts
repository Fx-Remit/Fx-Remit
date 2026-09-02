
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model SavedRecipient
 * 
 */
export type SavedRecipient = $Result.DefaultSelection<Prisma.$SavedRecipientPayload>
/**
 * Model Transaction
 * 
 */
export type Transaction = $Result.DefaultSelection<Prisma.$TransactionPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const RemittanceRail: {
  EVM: 'EVM',
  STELLAR: 'STELLAR'
};

export type RemittanceRail = (typeof RemittanceRail)[keyof typeof RemittanceRail]


export const RecipientType: {
  BANK: 'BANK',
  MOBILE: 'MOBILE'
};

export type RecipientType = (typeof RecipientType)[keyof typeof RecipientType]


export const TransactionType: {
  DEPOSIT: 'DEPOSIT',
  REMITTANCE: 'REMITTANCE'
};

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType]


export const Status: {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PROCESSING: 'PROCESSING',
  REFUNDING: 'REFUNDING',
  REFUND_REQUIRED: 'REFUND_REQUIRED'
};

export type Status = (typeof Status)[keyof typeof Status]

}

export type RemittanceRail = $Enums.RemittanceRail

export const RemittanceRail: typeof $Enums.RemittanceRail

export type RecipientType = $Enums.RecipientType

export const RecipientType: typeof $Enums.RecipientType

export type TransactionType = $Enums.TransactionType

export const TransactionType: typeof $Enums.TransactionType

export type Status = $Enums.Status

export const Status: typeof $Enums.Status

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.savedRecipient`: Exposes CRUD operations for the **SavedRecipient** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SavedRecipients
    * const savedRecipients = await prisma.savedRecipient.findMany()
    * ```
    */
  get savedRecipient(): Prisma.SavedRecipientDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.transaction`: Exposes CRUD operations for the **Transaction** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Transactions
    * const transactions = await prisma.transaction.findMany()
    * ```
    */
  get transaction(): Prisma.TransactionDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.6.0
   * Query Engine version: 75cbdc1eb7150937890ad5465d861175c6624711
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    SavedRecipient: 'SavedRecipient',
    Transaction: 'Transaction'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "savedRecipient" | "transaction"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.UserUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      SavedRecipient: {
        payload: Prisma.$SavedRecipientPayload<ExtArgs>
        fields: Prisma.SavedRecipientFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SavedRecipientFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SavedRecipientFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          findFirst: {
            args: Prisma.SavedRecipientFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SavedRecipientFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          findMany: {
            args: Prisma.SavedRecipientFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>[]
          }
          create: {
            args: Prisma.SavedRecipientCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          createMany: {
            args: Prisma.SavedRecipientCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SavedRecipientCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>[]
          }
          delete: {
            args: Prisma.SavedRecipientDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          update: {
            args: Prisma.SavedRecipientUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          deleteMany: {
            args: Prisma.SavedRecipientDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SavedRecipientUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SavedRecipientUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>[]
          }
          upsert: {
            args: Prisma.SavedRecipientUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SavedRecipientPayload>
          }
          aggregate: {
            args: Prisma.SavedRecipientAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSavedRecipient>
          }
          groupBy: {
            args: Prisma.SavedRecipientGroupByArgs<ExtArgs>
            result: $Utils.Optional<SavedRecipientGroupByOutputType>[]
          }
          count: {
            args: Prisma.SavedRecipientCountArgs<ExtArgs>
            result: $Utils.Optional<SavedRecipientCountAggregateOutputType> | number
          }
        }
      }
      Transaction: {
        payload: Prisma.$TransactionPayload<ExtArgs>
        fields: Prisma.TransactionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TransactionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TransactionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          findFirst: {
            args: Prisma.TransactionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TransactionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          findMany: {
            args: Prisma.TransactionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>[]
          }
          create: {
            args: Prisma.TransactionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          createMany: {
            args: Prisma.TransactionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TransactionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>[]
          }
          delete: {
            args: Prisma.TransactionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          update: {
            args: Prisma.TransactionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          deleteMany: {
            args: Prisma.TransactionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TransactionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TransactionUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>[]
          }
          upsert: {
            args: Prisma.TransactionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TransactionPayload>
          }
          aggregate: {
            args: Prisma.TransactionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTransaction>
          }
          groupBy: {
            args: Prisma.TransactionGroupByArgs<ExtArgs>
            result: $Utils.Optional<TransactionGroupByOutputType>[]
          }
          count: {
            args: Prisma.TransactionCountArgs<ExtArgs>
            result: $Utils.Optional<TransactionCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    savedRecipient?: SavedRecipientOmit
    transaction?: TransactionOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    transactions: number
    savedRecipients: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    transactions?: boolean | UserCountOutputTypeCountTransactionsArgs
    savedRecipients?: boolean | UserCountOutputTypeCountSavedRecipientsArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountTransactionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TransactionWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountSavedRecipientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SavedRecipientWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserAvgAggregateOutputType = {
    totalSentUsd: Decimal | null
    transactionCount: number | null
    walletBalance: Decimal | null
  }

  export type UserSumAggregateOutputType = {
    totalSentUsd: Decimal | null
    transactionCount: number | null
    walletBalance: Decimal | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    privyDid: string | null
    walletAddress: string | null
    stellarPublicKey: string | null
    fullName: string | null
    email: string | null
    avatarUrl: string | null
    totalSentUsd: Decimal | null
    transactionCount: number | null
    createdAt: Date | null
    updatedAt: Date | null
    displayName: string | null
    lastLoginAt: Date | null
    walletBalance: Decimal | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    privyDid: string | null
    walletAddress: string | null
    stellarPublicKey: string | null
    fullName: string | null
    email: string | null
    avatarUrl: string | null
    totalSentUsd: Decimal | null
    transactionCount: number | null
    createdAt: Date | null
    updatedAt: Date | null
    displayName: string | null
    lastLoginAt: Date | null
    walletBalance: Decimal | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    privyDid: number
    walletAddress: number
    stellarPublicKey: number
    fullName: number
    email: number
    avatarUrl: number
    totalSentUsd: number
    transactionCount: number
    createdAt: number
    updatedAt: number
    displayName: number
    lastLoginAt: number
    walletBalance: number
    _all: number
  }


  export type UserAvgAggregateInputType = {
    totalSentUsd?: true
    transactionCount?: true
    walletBalance?: true
  }

  export type UserSumAggregateInputType = {
    totalSentUsd?: true
    transactionCount?: true
    walletBalance?: true
  }

  export type UserMinAggregateInputType = {
    id?: true
    privyDid?: true
    walletAddress?: true
    stellarPublicKey?: true
    fullName?: true
    email?: true
    avatarUrl?: true
    totalSentUsd?: true
    transactionCount?: true
    createdAt?: true
    updatedAt?: true
    displayName?: true
    lastLoginAt?: true
    walletBalance?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    privyDid?: true
    walletAddress?: true
    stellarPublicKey?: true
    fullName?: true
    email?: true
    avatarUrl?: true
    totalSentUsd?: true
    transactionCount?: true
    createdAt?: true
    updatedAt?: true
    displayName?: true
    lastLoginAt?: true
    walletBalance?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    privyDid?: true
    walletAddress?: true
    stellarPublicKey?: true
    fullName?: true
    email?: true
    avatarUrl?: true
    totalSentUsd?: true
    transactionCount?: true
    createdAt?: true
    updatedAt?: true
    displayName?: true
    lastLoginAt?: true
    walletBalance?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: UserAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: UserSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _avg?: UserAvgAggregateInputType
    _sum?: UserSumAggregateInputType
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    privyDid: string
    walletAddress: string | null
    stellarPublicKey: string | null
    fullName: string | null
    email: string | null
    avatarUrl: string | null
    totalSentUsd: Decimal
    transactionCount: number
    createdAt: Date
    updatedAt: Date
    displayName: string | null
    lastLoginAt: Date | null
    walletBalance: Decimal
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    privyDid?: boolean
    walletAddress?: boolean
    stellarPublicKey?: boolean
    fullName?: boolean
    email?: boolean
    avatarUrl?: boolean
    totalSentUsd?: boolean
    transactionCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    displayName?: boolean
    lastLoginAt?: boolean
    walletBalance?: boolean
    transactions?: boolean | User$transactionsArgs<ExtArgs>
    savedRecipients?: boolean | User$savedRecipientsArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    privyDid?: boolean
    walletAddress?: boolean
    stellarPublicKey?: boolean
    fullName?: boolean
    email?: boolean
    avatarUrl?: boolean
    totalSentUsd?: boolean
    transactionCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    displayName?: boolean
    lastLoginAt?: boolean
    walletBalance?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    privyDid?: boolean
    walletAddress?: boolean
    stellarPublicKey?: boolean
    fullName?: boolean
    email?: boolean
    avatarUrl?: boolean
    totalSentUsd?: boolean
    transactionCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    displayName?: boolean
    lastLoginAt?: boolean
    walletBalance?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    privyDid?: boolean
    walletAddress?: boolean
    stellarPublicKey?: boolean
    fullName?: boolean
    email?: boolean
    avatarUrl?: boolean
    totalSentUsd?: boolean
    transactionCount?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    displayName?: boolean
    lastLoginAt?: boolean
    walletBalance?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "privyDid" | "walletAddress" | "stellarPublicKey" | "fullName" | "email" | "avatarUrl" | "totalSentUsd" | "transactionCount" | "createdAt" | "updatedAt" | "displayName" | "lastLoginAt" | "walletBalance", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    transactions?: boolean | User$transactionsArgs<ExtArgs>
    savedRecipients?: boolean | User$savedRecipientsArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type UserIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      transactions: Prisma.$TransactionPayload<ExtArgs>[]
      savedRecipients: Prisma.$SavedRecipientPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      privyDid: string
      walletAddress: string | null
      stellarPublicKey: string | null
      fullName: string | null
      email: string | null
      avatarUrl: string | null
      totalSentUsd: Prisma.Decimal
      transactionCount: number
      createdAt: Date
      updatedAt: Date
      displayName: string | null
      lastLoginAt: Date | null
      walletBalance: Prisma.Decimal
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users and returns the data updated in the database.
     * @param {UserUpdateManyAndReturnArgs} args - Arguments to update many Users.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Users and only return the `id`
     * const userWithIdOnly = await prisma.user.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends UserUpdateManyAndReturnArgs>(args: SelectSubset<T, UserUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    transactions<T extends User$transactionsArgs<ExtArgs> = {}>(args?: Subset<T, User$transactionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    savedRecipients<T extends User$savedRecipientsArgs<ExtArgs> = {}>(args?: Subset<T, User$savedRecipientsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly privyDid: FieldRef<"User", 'String'>
    readonly walletAddress: FieldRef<"User", 'String'>
    readonly stellarPublicKey: FieldRef<"User", 'String'>
    readonly fullName: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly avatarUrl: FieldRef<"User", 'String'>
    readonly totalSentUsd: FieldRef<"User", 'Decimal'>
    readonly transactionCount: FieldRef<"User", 'Int'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
    readonly displayName: FieldRef<"User", 'String'>
    readonly lastLoginAt: FieldRef<"User", 'DateTime'>
    readonly walletBalance: FieldRef<"User", 'Decimal'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User updateManyAndReturn
   */
  export type UserUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User.transactions
   */
  export type User$transactionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    where?: TransactionWhereInput
    orderBy?: TransactionOrderByWithRelationInput | TransactionOrderByWithRelationInput[]
    cursor?: TransactionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TransactionScalarFieldEnum | TransactionScalarFieldEnum[]
  }

  /**
   * User.savedRecipients
   */
  export type User$savedRecipientsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    where?: SavedRecipientWhereInput
    orderBy?: SavedRecipientOrderByWithRelationInput | SavedRecipientOrderByWithRelationInput[]
    cursor?: SavedRecipientWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SavedRecipientScalarFieldEnum | SavedRecipientScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model SavedRecipient
   */

  export type AggregateSavedRecipient = {
    _count: SavedRecipientCountAggregateOutputType | null
    _min: SavedRecipientMinAggregateOutputType | null
    _max: SavedRecipientMaxAggregateOutputType | null
  }

  export type SavedRecipientMinAggregateOutputType = {
    id: string | null
    userId: string | null
    type: $Enums.RecipientType | null
    currency: string | null
    institutionCode: string | null
    institutionName: string | null
    accountIdentifier: string | null
    accountName: string | null
    lastUsedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SavedRecipientMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    type: $Enums.RecipientType | null
    currency: string | null
    institutionCode: string | null
    institutionName: string | null
    accountIdentifier: string | null
    accountName: string | null
    lastUsedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SavedRecipientCountAggregateOutputType = {
    id: number
    userId: number
    type: number
    currency: number
    institutionCode: number
    institutionName: number
    accountIdentifier: number
    accountName: number
    lastUsedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SavedRecipientMinAggregateInputType = {
    id?: true
    userId?: true
    type?: true
    currency?: true
    institutionCode?: true
    institutionName?: true
    accountIdentifier?: true
    accountName?: true
    lastUsedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SavedRecipientMaxAggregateInputType = {
    id?: true
    userId?: true
    type?: true
    currency?: true
    institutionCode?: true
    institutionName?: true
    accountIdentifier?: true
    accountName?: true
    lastUsedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SavedRecipientCountAggregateInputType = {
    id?: true
    userId?: true
    type?: true
    currency?: true
    institutionCode?: true
    institutionName?: true
    accountIdentifier?: true
    accountName?: true
    lastUsedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SavedRecipientAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SavedRecipient to aggregate.
     */
    where?: SavedRecipientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SavedRecipients to fetch.
     */
    orderBy?: SavedRecipientOrderByWithRelationInput | SavedRecipientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SavedRecipientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SavedRecipients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SavedRecipients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SavedRecipients
    **/
    _count?: true | SavedRecipientCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SavedRecipientMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SavedRecipientMaxAggregateInputType
  }

  export type GetSavedRecipientAggregateType<T extends SavedRecipientAggregateArgs> = {
        [P in keyof T & keyof AggregateSavedRecipient]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSavedRecipient[P]>
      : GetScalarType<T[P], AggregateSavedRecipient[P]>
  }




  export type SavedRecipientGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SavedRecipientWhereInput
    orderBy?: SavedRecipientOrderByWithAggregationInput | SavedRecipientOrderByWithAggregationInput[]
    by: SavedRecipientScalarFieldEnum[] | SavedRecipientScalarFieldEnum
    having?: SavedRecipientScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SavedRecipientCountAggregateInputType | true
    _min?: SavedRecipientMinAggregateInputType
    _max?: SavedRecipientMaxAggregateInputType
  }

  export type SavedRecipientGroupByOutputType = {
    id: string
    userId: string
    type: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt: Date
    createdAt: Date
    updatedAt: Date
    _count: SavedRecipientCountAggregateOutputType | null
    _min: SavedRecipientMinAggregateOutputType | null
    _max: SavedRecipientMaxAggregateOutputType | null
  }

  type GetSavedRecipientGroupByPayload<T extends SavedRecipientGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SavedRecipientGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SavedRecipientGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SavedRecipientGroupByOutputType[P]>
            : GetScalarType<T[P], SavedRecipientGroupByOutputType[P]>
        }
      >
    >


  export type SavedRecipientSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    type?: boolean
    currency?: boolean
    institutionCode?: boolean
    institutionName?: boolean
    accountIdentifier?: boolean
    accountName?: boolean
    lastUsedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["savedRecipient"]>

  export type SavedRecipientSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    type?: boolean
    currency?: boolean
    institutionCode?: boolean
    institutionName?: boolean
    accountIdentifier?: boolean
    accountName?: boolean
    lastUsedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["savedRecipient"]>

  export type SavedRecipientSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    type?: boolean
    currency?: boolean
    institutionCode?: boolean
    institutionName?: boolean
    accountIdentifier?: boolean
    accountName?: boolean
    lastUsedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["savedRecipient"]>

  export type SavedRecipientSelectScalar = {
    id?: boolean
    userId?: boolean
    type?: boolean
    currency?: boolean
    institutionCode?: boolean
    institutionName?: boolean
    accountIdentifier?: boolean
    accountName?: boolean
    lastUsedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SavedRecipientOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "type" | "currency" | "institutionCode" | "institutionName" | "accountIdentifier" | "accountName" | "lastUsedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["savedRecipient"]>
  export type SavedRecipientInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type SavedRecipientIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type SavedRecipientIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $SavedRecipientPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SavedRecipient"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      type: $Enums.RecipientType
      currency: string
      institutionCode: string
      institutionName: string
      accountIdentifier: string
      accountName: string
      lastUsedAt: Date
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["savedRecipient"]>
    composites: {}
  }

  type SavedRecipientGetPayload<S extends boolean | null | undefined | SavedRecipientDefaultArgs> = $Result.GetResult<Prisma.$SavedRecipientPayload, S>

  type SavedRecipientCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SavedRecipientFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SavedRecipientCountAggregateInputType | true
    }

  export interface SavedRecipientDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SavedRecipient'], meta: { name: 'SavedRecipient' } }
    /**
     * Find zero or one SavedRecipient that matches the filter.
     * @param {SavedRecipientFindUniqueArgs} args - Arguments to find a SavedRecipient
     * @example
     * // Get one SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SavedRecipientFindUniqueArgs>(args: SelectSubset<T, SavedRecipientFindUniqueArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SavedRecipient that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SavedRecipientFindUniqueOrThrowArgs} args - Arguments to find a SavedRecipient
     * @example
     * // Get one SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SavedRecipientFindUniqueOrThrowArgs>(args: SelectSubset<T, SavedRecipientFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SavedRecipient that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientFindFirstArgs} args - Arguments to find a SavedRecipient
     * @example
     * // Get one SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SavedRecipientFindFirstArgs>(args?: SelectSubset<T, SavedRecipientFindFirstArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SavedRecipient that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientFindFirstOrThrowArgs} args - Arguments to find a SavedRecipient
     * @example
     * // Get one SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SavedRecipientFindFirstOrThrowArgs>(args?: SelectSubset<T, SavedRecipientFindFirstOrThrowArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SavedRecipients that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SavedRecipients
     * const savedRecipients = await prisma.savedRecipient.findMany()
     * 
     * // Get first 10 SavedRecipients
     * const savedRecipients = await prisma.savedRecipient.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const savedRecipientWithIdOnly = await prisma.savedRecipient.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SavedRecipientFindManyArgs>(args?: SelectSubset<T, SavedRecipientFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SavedRecipient.
     * @param {SavedRecipientCreateArgs} args - Arguments to create a SavedRecipient.
     * @example
     * // Create one SavedRecipient
     * const SavedRecipient = await prisma.savedRecipient.create({
     *   data: {
     *     // ... data to create a SavedRecipient
     *   }
     * })
     * 
     */
    create<T extends SavedRecipientCreateArgs>(args: SelectSubset<T, SavedRecipientCreateArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SavedRecipients.
     * @param {SavedRecipientCreateManyArgs} args - Arguments to create many SavedRecipients.
     * @example
     * // Create many SavedRecipients
     * const savedRecipient = await prisma.savedRecipient.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SavedRecipientCreateManyArgs>(args?: SelectSubset<T, SavedRecipientCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SavedRecipients and returns the data saved in the database.
     * @param {SavedRecipientCreateManyAndReturnArgs} args - Arguments to create many SavedRecipients.
     * @example
     * // Create many SavedRecipients
     * const savedRecipient = await prisma.savedRecipient.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SavedRecipients and only return the `id`
     * const savedRecipientWithIdOnly = await prisma.savedRecipient.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SavedRecipientCreateManyAndReturnArgs>(args?: SelectSubset<T, SavedRecipientCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SavedRecipient.
     * @param {SavedRecipientDeleteArgs} args - Arguments to delete one SavedRecipient.
     * @example
     * // Delete one SavedRecipient
     * const SavedRecipient = await prisma.savedRecipient.delete({
     *   where: {
     *     // ... filter to delete one SavedRecipient
     *   }
     * })
     * 
     */
    delete<T extends SavedRecipientDeleteArgs>(args: SelectSubset<T, SavedRecipientDeleteArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SavedRecipient.
     * @param {SavedRecipientUpdateArgs} args - Arguments to update one SavedRecipient.
     * @example
     * // Update one SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SavedRecipientUpdateArgs>(args: SelectSubset<T, SavedRecipientUpdateArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SavedRecipients.
     * @param {SavedRecipientDeleteManyArgs} args - Arguments to filter SavedRecipients to delete.
     * @example
     * // Delete a few SavedRecipients
     * const { count } = await prisma.savedRecipient.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SavedRecipientDeleteManyArgs>(args?: SelectSubset<T, SavedRecipientDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SavedRecipients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SavedRecipients
     * const savedRecipient = await prisma.savedRecipient.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SavedRecipientUpdateManyArgs>(args: SelectSubset<T, SavedRecipientUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SavedRecipients and returns the data updated in the database.
     * @param {SavedRecipientUpdateManyAndReturnArgs} args - Arguments to update many SavedRecipients.
     * @example
     * // Update many SavedRecipients
     * const savedRecipient = await prisma.savedRecipient.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SavedRecipients and only return the `id`
     * const savedRecipientWithIdOnly = await prisma.savedRecipient.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends SavedRecipientUpdateManyAndReturnArgs>(args: SelectSubset<T, SavedRecipientUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SavedRecipient.
     * @param {SavedRecipientUpsertArgs} args - Arguments to update or create a SavedRecipient.
     * @example
     * // Update or create a SavedRecipient
     * const savedRecipient = await prisma.savedRecipient.upsert({
     *   create: {
     *     // ... data to create a SavedRecipient
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SavedRecipient we want to update
     *   }
     * })
     */
    upsert<T extends SavedRecipientUpsertArgs>(args: SelectSubset<T, SavedRecipientUpsertArgs<ExtArgs>>): Prisma__SavedRecipientClient<$Result.GetResult<Prisma.$SavedRecipientPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SavedRecipients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientCountArgs} args - Arguments to filter SavedRecipients to count.
     * @example
     * // Count the number of SavedRecipients
     * const count = await prisma.savedRecipient.count({
     *   where: {
     *     // ... the filter for the SavedRecipients we want to count
     *   }
     * })
    **/
    count<T extends SavedRecipientCountArgs>(
      args?: Subset<T, SavedRecipientCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SavedRecipientCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SavedRecipient.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SavedRecipientAggregateArgs>(args: Subset<T, SavedRecipientAggregateArgs>): Prisma.PrismaPromise<GetSavedRecipientAggregateType<T>>

    /**
     * Group by SavedRecipient.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SavedRecipientGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SavedRecipientGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SavedRecipientGroupByArgs['orderBy'] }
        : { orderBy?: SavedRecipientGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SavedRecipientGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSavedRecipientGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SavedRecipient model
   */
  readonly fields: SavedRecipientFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SavedRecipient.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SavedRecipientClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the SavedRecipient model
   */
  interface SavedRecipientFieldRefs {
    readonly id: FieldRef<"SavedRecipient", 'String'>
    readonly userId: FieldRef<"SavedRecipient", 'String'>
    readonly type: FieldRef<"SavedRecipient", 'RecipientType'>
    readonly currency: FieldRef<"SavedRecipient", 'String'>
    readonly institutionCode: FieldRef<"SavedRecipient", 'String'>
    readonly institutionName: FieldRef<"SavedRecipient", 'String'>
    readonly accountIdentifier: FieldRef<"SavedRecipient", 'String'>
    readonly accountName: FieldRef<"SavedRecipient", 'String'>
    readonly lastUsedAt: FieldRef<"SavedRecipient", 'DateTime'>
    readonly createdAt: FieldRef<"SavedRecipient", 'DateTime'>
    readonly updatedAt: FieldRef<"SavedRecipient", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SavedRecipient findUnique
   */
  export type SavedRecipientFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter, which SavedRecipient to fetch.
     */
    where: SavedRecipientWhereUniqueInput
  }

  /**
   * SavedRecipient findUniqueOrThrow
   */
  export type SavedRecipientFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter, which SavedRecipient to fetch.
     */
    where: SavedRecipientWhereUniqueInput
  }

  /**
   * SavedRecipient findFirst
   */
  export type SavedRecipientFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter, which SavedRecipient to fetch.
     */
    where?: SavedRecipientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SavedRecipients to fetch.
     */
    orderBy?: SavedRecipientOrderByWithRelationInput | SavedRecipientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SavedRecipients.
     */
    cursor?: SavedRecipientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SavedRecipients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SavedRecipients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SavedRecipients.
     */
    distinct?: SavedRecipientScalarFieldEnum | SavedRecipientScalarFieldEnum[]
  }

  /**
   * SavedRecipient findFirstOrThrow
   */
  export type SavedRecipientFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter, which SavedRecipient to fetch.
     */
    where?: SavedRecipientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SavedRecipients to fetch.
     */
    orderBy?: SavedRecipientOrderByWithRelationInput | SavedRecipientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SavedRecipients.
     */
    cursor?: SavedRecipientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SavedRecipients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SavedRecipients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SavedRecipients.
     */
    distinct?: SavedRecipientScalarFieldEnum | SavedRecipientScalarFieldEnum[]
  }

  /**
   * SavedRecipient findMany
   */
  export type SavedRecipientFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter, which SavedRecipients to fetch.
     */
    where?: SavedRecipientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SavedRecipients to fetch.
     */
    orderBy?: SavedRecipientOrderByWithRelationInput | SavedRecipientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SavedRecipients.
     */
    cursor?: SavedRecipientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SavedRecipients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SavedRecipients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SavedRecipients.
     */
    distinct?: SavedRecipientScalarFieldEnum | SavedRecipientScalarFieldEnum[]
  }

  /**
   * SavedRecipient create
   */
  export type SavedRecipientCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * The data needed to create a SavedRecipient.
     */
    data: XOR<SavedRecipientCreateInput, SavedRecipientUncheckedCreateInput>
  }

  /**
   * SavedRecipient createMany
   */
  export type SavedRecipientCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SavedRecipients.
     */
    data: SavedRecipientCreateManyInput | SavedRecipientCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SavedRecipient createManyAndReturn
   */
  export type SavedRecipientCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * The data used to create many SavedRecipients.
     */
    data: SavedRecipientCreateManyInput | SavedRecipientCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SavedRecipient update
   */
  export type SavedRecipientUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * The data needed to update a SavedRecipient.
     */
    data: XOR<SavedRecipientUpdateInput, SavedRecipientUncheckedUpdateInput>
    /**
     * Choose, which SavedRecipient to update.
     */
    where: SavedRecipientWhereUniqueInput
  }

  /**
   * SavedRecipient updateMany
   */
  export type SavedRecipientUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SavedRecipients.
     */
    data: XOR<SavedRecipientUpdateManyMutationInput, SavedRecipientUncheckedUpdateManyInput>
    /**
     * Filter which SavedRecipients to update
     */
    where?: SavedRecipientWhereInput
    /**
     * Limit how many SavedRecipients to update.
     */
    limit?: number
  }

  /**
   * SavedRecipient updateManyAndReturn
   */
  export type SavedRecipientUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * The data used to update SavedRecipients.
     */
    data: XOR<SavedRecipientUpdateManyMutationInput, SavedRecipientUncheckedUpdateManyInput>
    /**
     * Filter which SavedRecipients to update
     */
    where?: SavedRecipientWhereInput
    /**
     * Limit how many SavedRecipients to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SavedRecipient upsert
   */
  export type SavedRecipientUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * The filter to search for the SavedRecipient to update in case it exists.
     */
    where: SavedRecipientWhereUniqueInput
    /**
     * In case the SavedRecipient found by the `where` argument doesn't exist, create a new SavedRecipient with this data.
     */
    create: XOR<SavedRecipientCreateInput, SavedRecipientUncheckedCreateInput>
    /**
     * In case the SavedRecipient was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SavedRecipientUpdateInput, SavedRecipientUncheckedUpdateInput>
  }

  /**
   * SavedRecipient delete
   */
  export type SavedRecipientDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
    /**
     * Filter which SavedRecipient to delete.
     */
    where: SavedRecipientWhereUniqueInput
  }

  /**
   * SavedRecipient deleteMany
   */
  export type SavedRecipientDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SavedRecipients to delete
     */
    where?: SavedRecipientWhereInput
    /**
     * Limit how many SavedRecipients to delete.
     */
    limit?: number
  }

  /**
   * SavedRecipient without action
   */
  export type SavedRecipientDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SavedRecipient
     */
    select?: SavedRecipientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SavedRecipient
     */
    omit?: SavedRecipientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SavedRecipientInclude<ExtArgs> | null
  }


  /**
   * Model Transaction
   */

  export type AggregateTransaction = {
    _count: TransactionCountAggregateOutputType | null
    _avg: TransactionAvgAggregateOutputType | null
    _sum: TransactionSumAggregateOutputType | null
    _min: TransactionMinAggregateOutputType | null
    _max: TransactionMaxAggregateOutputType | null
  }

  export type TransactionAvgAggregateOutputType = {
    orderId: number | null
    amountUsd: Decimal | null
    payoutFiat: Decimal | null
    blockNumber: number | null
    chainId: number | null
    logIndex: number | null
  }

  export type TransactionSumAggregateOutputType = {
    orderId: bigint | null
    amountUsd: Decimal | null
    payoutFiat: Decimal | null
    blockNumber: bigint | null
    chainId: number | null
    logIndex: number | null
  }

  export type TransactionMinAggregateOutputType = {
    id: string | null
    userId: string | null
    orderId: bigint | null
    txHash: string | null
    rail: $Enums.RemittanceRail | null
    stellarPaymentHash: string | null
    anchorTransactionId: string | null
    corridor: string | null
    sourceToken: string | null
    amountUsd: Decimal | null
    payoutFiat: Decimal | null
    status: $Enums.Status | null
    recipientName: string | null
    recipientBank: string | null
    recipientAcc: string | null
    recipientBankCode: string | null
    createdAt: Date | null
    blockNumber: bigint | null
    chainId: number | null
    externalId: string | null
    logIndex: number | null
    updatedAt: Date | null
    type: $Enums.TransactionType | null
    refundTxHash: string | null
  }

  export type TransactionMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    orderId: bigint | null
    txHash: string | null
    rail: $Enums.RemittanceRail | null
    stellarPaymentHash: string | null
    anchorTransactionId: string | null
    corridor: string | null
    sourceToken: string | null
    amountUsd: Decimal | null
    payoutFiat: Decimal | null
    status: $Enums.Status | null
    recipientName: string | null
    recipientBank: string | null
    recipientAcc: string | null
    recipientBankCode: string | null
    createdAt: Date | null
    blockNumber: bigint | null
    chainId: number | null
    externalId: string | null
    logIndex: number | null
    updatedAt: Date | null
    type: $Enums.TransactionType | null
    refundTxHash: string | null
  }

  export type TransactionCountAggregateOutputType = {
    id: number
    userId: number
    orderId: number
    txHash: number
    rail: number
    stellarPaymentHash: number
    anchorTransactionId: number
    corridor: number
    sourceToken: number
    amountUsd: number
    payoutFiat: number
    status: number
    recipientName: number
    recipientBank: number
    recipientAcc: number
    recipientBankCode: number
    createdAt: number
    blockNumber: number
    chainId: number
    externalId: number
    logIndex: number
    updatedAt: number
    type: number
    refundTxHash: number
    _all: number
  }


  export type TransactionAvgAggregateInputType = {
    orderId?: true
    amountUsd?: true
    payoutFiat?: true
    blockNumber?: true
    chainId?: true
    logIndex?: true
  }

  export type TransactionSumAggregateInputType = {
    orderId?: true
    amountUsd?: true
    payoutFiat?: true
    blockNumber?: true
    chainId?: true
    logIndex?: true
  }

  export type TransactionMinAggregateInputType = {
    id?: true
    userId?: true
    orderId?: true
    txHash?: true
    rail?: true
    stellarPaymentHash?: true
    anchorTransactionId?: true
    corridor?: true
    sourceToken?: true
    amountUsd?: true
    payoutFiat?: true
    status?: true
    recipientName?: true
    recipientBank?: true
    recipientAcc?: true
    recipientBankCode?: true
    createdAt?: true
    blockNumber?: true
    chainId?: true
    externalId?: true
    logIndex?: true
    updatedAt?: true
    type?: true
    refundTxHash?: true
  }

  export type TransactionMaxAggregateInputType = {
    id?: true
    userId?: true
    orderId?: true
    txHash?: true
    rail?: true
    stellarPaymentHash?: true
    anchorTransactionId?: true
    corridor?: true
    sourceToken?: true
    amountUsd?: true
    payoutFiat?: true
    status?: true
    recipientName?: true
    recipientBank?: true
    recipientAcc?: true
    recipientBankCode?: true
    createdAt?: true
    blockNumber?: true
    chainId?: true
    externalId?: true
    logIndex?: true
    updatedAt?: true
    type?: true
    refundTxHash?: true
  }

  export type TransactionCountAggregateInputType = {
    id?: true
    userId?: true
    orderId?: true
    txHash?: true
    rail?: true
    stellarPaymentHash?: true
    anchorTransactionId?: true
    corridor?: true
    sourceToken?: true
    amountUsd?: true
    payoutFiat?: true
    status?: true
    recipientName?: true
    recipientBank?: true
    recipientAcc?: true
    recipientBankCode?: true
    createdAt?: true
    blockNumber?: true
    chainId?: true
    externalId?: true
    logIndex?: true
    updatedAt?: true
    type?: true
    refundTxHash?: true
    _all?: true
  }

  export type TransactionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Transaction to aggregate.
     */
    where?: TransactionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Transactions to fetch.
     */
    orderBy?: TransactionOrderByWithRelationInput | TransactionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TransactionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Transactions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Transactions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Transactions
    **/
    _count?: true | TransactionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TransactionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TransactionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TransactionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TransactionMaxAggregateInputType
  }

  export type GetTransactionAggregateType<T extends TransactionAggregateArgs> = {
        [P in keyof T & keyof AggregateTransaction]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTransaction[P]>
      : GetScalarType<T[P], AggregateTransaction[P]>
  }




  export type TransactionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TransactionWhereInput
    orderBy?: TransactionOrderByWithAggregationInput | TransactionOrderByWithAggregationInput[]
    by: TransactionScalarFieldEnum[] | TransactionScalarFieldEnum
    having?: TransactionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TransactionCountAggregateInputType | true
    _avg?: TransactionAvgAggregateInputType
    _sum?: TransactionSumAggregateInputType
    _min?: TransactionMinAggregateInputType
    _max?: TransactionMaxAggregateInputType
  }

  export type TransactionGroupByOutputType = {
    id: string
    userId: string
    orderId: bigint
    txHash: string
    rail: $Enums.RemittanceRail
    stellarPaymentHash: string | null
    anchorTransactionId: string | null
    corridor: string | null
    sourceToken: string
    amountUsd: Decimal
    payoutFiat: Decimal
    status: $Enums.Status
    recipientName: string | null
    recipientBank: string | null
    recipientAcc: string | null
    recipientBankCode: string | null
    createdAt: Date
    blockNumber: bigint
    chainId: number
    externalId: string | null
    logIndex: number
    updatedAt: Date
    type: $Enums.TransactionType
    refundTxHash: string | null
    _count: TransactionCountAggregateOutputType | null
    _avg: TransactionAvgAggregateOutputType | null
    _sum: TransactionSumAggregateOutputType | null
    _min: TransactionMinAggregateOutputType | null
    _max: TransactionMaxAggregateOutputType | null
  }

  type GetTransactionGroupByPayload<T extends TransactionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TransactionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TransactionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TransactionGroupByOutputType[P]>
            : GetScalarType<T[P], TransactionGroupByOutputType[P]>
        }
      >
    >


  export type TransactionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    orderId?: boolean
    txHash?: boolean
    rail?: boolean
    stellarPaymentHash?: boolean
    anchorTransactionId?: boolean
    corridor?: boolean
    sourceToken?: boolean
    amountUsd?: boolean
    payoutFiat?: boolean
    status?: boolean
    recipientName?: boolean
    recipientBank?: boolean
    recipientAcc?: boolean
    recipientBankCode?: boolean
    createdAt?: boolean
    blockNumber?: boolean
    chainId?: boolean
    externalId?: boolean
    logIndex?: boolean
    updatedAt?: boolean
    type?: boolean
    refundTxHash?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["transaction"]>

  export type TransactionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    orderId?: boolean
    txHash?: boolean
    rail?: boolean
    stellarPaymentHash?: boolean
    anchorTransactionId?: boolean
    corridor?: boolean
    sourceToken?: boolean
    amountUsd?: boolean
    payoutFiat?: boolean
    status?: boolean
    recipientName?: boolean
    recipientBank?: boolean
    recipientAcc?: boolean
    recipientBankCode?: boolean
    createdAt?: boolean
    blockNumber?: boolean
    chainId?: boolean
    externalId?: boolean
    logIndex?: boolean
    updatedAt?: boolean
    type?: boolean
    refundTxHash?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["transaction"]>

  export type TransactionSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    orderId?: boolean
    txHash?: boolean
    rail?: boolean
    stellarPaymentHash?: boolean
    anchorTransactionId?: boolean
    corridor?: boolean
    sourceToken?: boolean
    amountUsd?: boolean
    payoutFiat?: boolean
    status?: boolean
    recipientName?: boolean
    recipientBank?: boolean
    recipientAcc?: boolean
    recipientBankCode?: boolean
    createdAt?: boolean
    blockNumber?: boolean
    chainId?: boolean
    externalId?: boolean
    logIndex?: boolean
    updatedAt?: boolean
    type?: boolean
    refundTxHash?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["transaction"]>

  export type TransactionSelectScalar = {
    id?: boolean
    userId?: boolean
    orderId?: boolean
    txHash?: boolean
    rail?: boolean
    stellarPaymentHash?: boolean
    anchorTransactionId?: boolean
    corridor?: boolean
    sourceToken?: boolean
    amountUsd?: boolean
    payoutFiat?: boolean
    status?: boolean
    recipientName?: boolean
    recipientBank?: boolean
    recipientAcc?: boolean
    recipientBankCode?: boolean
    createdAt?: boolean
    blockNumber?: boolean
    chainId?: boolean
    externalId?: boolean
    logIndex?: boolean
    updatedAt?: boolean
    type?: boolean
    refundTxHash?: boolean
  }

  export type TransactionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "orderId" | "txHash" | "rail" | "stellarPaymentHash" | "anchorTransactionId" | "corridor" | "sourceToken" | "amountUsd" | "payoutFiat" | "status" | "recipientName" | "recipientBank" | "recipientAcc" | "recipientBankCode" | "createdAt" | "blockNumber" | "chainId" | "externalId" | "logIndex" | "updatedAt" | "type" | "refundTxHash", ExtArgs["result"]["transaction"]>
  export type TransactionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type TransactionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type TransactionIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $TransactionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Transaction"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      orderId: bigint
      txHash: string
      rail: $Enums.RemittanceRail
      stellarPaymentHash: string | null
      anchorTransactionId: string | null
      corridor: string | null
      sourceToken: string
      amountUsd: Prisma.Decimal
      payoutFiat: Prisma.Decimal
      status: $Enums.Status
      recipientName: string | null
      recipientBank: string | null
      recipientAcc: string | null
      /**
       * * Paycrest institution code — required to reuse recipients without re-picking bank.
       */
      recipientBankCode: string | null
      createdAt: Date
      blockNumber: bigint
      chainId: number
      externalId: string | null
      logIndex: number
      updatedAt: Date
      type: $Enums.TransactionType
      /**
       * * On-chain Paycrest crypto refund hash linked for ops (#90). Per-user unique.
       */
      refundTxHash: string | null
    }, ExtArgs["result"]["transaction"]>
    composites: {}
  }

  type TransactionGetPayload<S extends boolean | null | undefined | TransactionDefaultArgs> = $Result.GetResult<Prisma.$TransactionPayload, S>

  type TransactionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TransactionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TransactionCountAggregateInputType | true
    }

  export interface TransactionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Transaction'], meta: { name: 'Transaction' } }
    /**
     * Find zero or one Transaction that matches the filter.
     * @param {TransactionFindUniqueArgs} args - Arguments to find a Transaction
     * @example
     * // Get one Transaction
     * const transaction = await prisma.transaction.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TransactionFindUniqueArgs>(args: SelectSubset<T, TransactionFindUniqueArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Transaction that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TransactionFindUniqueOrThrowArgs} args - Arguments to find a Transaction
     * @example
     * // Get one Transaction
     * const transaction = await prisma.transaction.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TransactionFindUniqueOrThrowArgs>(args: SelectSubset<T, TransactionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Transaction that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionFindFirstArgs} args - Arguments to find a Transaction
     * @example
     * // Get one Transaction
     * const transaction = await prisma.transaction.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TransactionFindFirstArgs>(args?: SelectSubset<T, TransactionFindFirstArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Transaction that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionFindFirstOrThrowArgs} args - Arguments to find a Transaction
     * @example
     * // Get one Transaction
     * const transaction = await prisma.transaction.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TransactionFindFirstOrThrowArgs>(args?: SelectSubset<T, TransactionFindFirstOrThrowArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Transactions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Transactions
     * const transactions = await prisma.transaction.findMany()
     * 
     * // Get first 10 Transactions
     * const transactions = await prisma.transaction.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const transactionWithIdOnly = await prisma.transaction.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TransactionFindManyArgs>(args?: SelectSubset<T, TransactionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Transaction.
     * @param {TransactionCreateArgs} args - Arguments to create a Transaction.
     * @example
     * // Create one Transaction
     * const Transaction = await prisma.transaction.create({
     *   data: {
     *     // ... data to create a Transaction
     *   }
     * })
     * 
     */
    create<T extends TransactionCreateArgs>(args: SelectSubset<T, TransactionCreateArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Transactions.
     * @param {TransactionCreateManyArgs} args - Arguments to create many Transactions.
     * @example
     * // Create many Transactions
     * const transaction = await prisma.transaction.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TransactionCreateManyArgs>(args?: SelectSubset<T, TransactionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Transactions and returns the data saved in the database.
     * @param {TransactionCreateManyAndReturnArgs} args - Arguments to create many Transactions.
     * @example
     * // Create many Transactions
     * const transaction = await prisma.transaction.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Transactions and only return the `id`
     * const transactionWithIdOnly = await prisma.transaction.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TransactionCreateManyAndReturnArgs>(args?: SelectSubset<T, TransactionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Transaction.
     * @param {TransactionDeleteArgs} args - Arguments to delete one Transaction.
     * @example
     * // Delete one Transaction
     * const Transaction = await prisma.transaction.delete({
     *   where: {
     *     // ... filter to delete one Transaction
     *   }
     * })
     * 
     */
    delete<T extends TransactionDeleteArgs>(args: SelectSubset<T, TransactionDeleteArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Transaction.
     * @param {TransactionUpdateArgs} args - Arguments to update one Transaction.
     * @example
     * // Update one Transaction
     * const transaction = await prisma.transaction.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TransactionUpdateArgs>(args: SelectSubset<T, TransactionUpdateArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Transactions.
     * @param {TransactionDeleteManyArgs} args - Arguments to filter Transactions to delete.
     * @example
     * // Delete a few Transactions
     * const { count } = await prisma.transaction.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TransactionDeleteManyArgs>(args?: SelectSubset<T, TransactionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Transactions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Transactions
     * const transaction = await prisma.transaction.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TransactionUpdateManyArgs>(args: SelectSubset<T, TransactionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Transactions and returns the data updated in the database.
     * @param {TransactionUpdateManyAndReturnArgs} args - Arguments to update many Transactions.
     * @example
     * // Update many Transactions
     * const transaction = await prisma.transaction.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Transactions and only return the `id`
     * const transactionWithIdOnly = await prisma.transaction.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TransactionUpdateManyAndReturnArgs>(args: SelectSubset<T, TransactionUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Transaction.
     * @param {TransactionUpsertArgs} args - Arguments to update or create a Transaction.
     * @example
     * // Update or create a Transaction
     * const transaction = await prisma.transaction.upsert({
     *   create: {
     *     // ... data to create a Transaction
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Transaction we want to update
     *   }
     * })
     */
    upsert<T extends TransactionUpsertArgs>(args: SelectSubset<T, TransactionUpsertArgs<ExtArgs>>): Prisma__TransactionClient<$Result.GetResult<Prisma.$TransactionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Transactions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionCountArgs} args - Arguments to filter Transactions to count.
     * @example
     * // Count the number of Transactions
     * const count = await prisma.transaction.count({
     *   where: {
     *     // ... the filter for the Transactions we want to count
     *   }
     * })
    **/
    count<T extends TransactionCountArgs>(
      args?: Subset<T, TransactionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TransactionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Transaction.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TransactionAggregateArgs>(args: Subset<T, TransactionAggregateArgs>): Prisma.PrismaPromise<GetTransactionAggregateType<T>>

    /**
     * Group by Transaction.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TransactionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TransactionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TransactionGroupByArgs['orderBy'] }
        : { orderBy?: TransactionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TransactionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTransactionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Transaction model
   */
  readonly fields: TransactionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Transaction.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TransactionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Transaction model
   */
  interface TransactionFieldRefs {
    readonly id: FieldRef<"Transaction", 'String'>
    readonly userId: FieldRef<"Transaction", 'String'>
    readonly orderId: FieldRef<"Transaction", 'BigInt'>
    readonly txHash: FieldRef<"Transaction", 'String'>
    readonly rail: FieldRef<"Transaction", 'RemittanceRail'>
    readonly stellarPaymentHash: FieldRef<"Transaction", 'String'>
    readonly anchorTransactionId: FieldRef<"Transaction", 'String'>
    readonly corridor: FieldRef<"Transaction", 'String'>
    readonly sourceToken: FieldRef<"Transaction", 'String'>
    readonly amountUsd: FieldRef<"Transaction", 'Decimal'>
    readonly payoutFiat: FieldRef<"Transaction", 'Decimal'>
    readonly status: FieldRef<"Transaction", 'Status'>
    readonly recipientName: FieldRef<"Transaction", 'String'>
    readonly recipientBank: FieldRef<"Transaction", 'String'>
    readonly recipientAcc: FieldRef<"Transaction", 'String'>
    readonly recipientBankCode: FieldRef<"Transaction", 'String'>
    readonly createdAt: FieldRef<"Transaction", 'DateTime'>
    readonly blockNumber: FieldRef<"Transaction", 'BigInt'>
    readonly chainId: FieldRef<"Transaction", 'Int'>
    readonly externalId: FieldRef<"Transaction", 'String'>
    readonly logIndex: FieldRef<"Transaction", 'Int'>
    readonly updatedAt: FieldRef<"Transaction", 'DateTime'>
    readonly type: FieldRef<"Transaction", 'TransactionType'>
    readonly refundTxHash: FieldRef<"Transaction", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Transaction findUnique
   */
  export type TransactionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter, which Transaction to fetch.
     */
    where: TransactionWhereUniqueInput
  }

  /**
   * Transaction findUniqueOrThrow
   */
  export type TransactionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter, which Transaction to fetch.
     */
    where: TransactionWhereUniqueInput
  }

  /**
   * Transaction findFirst
   */
  export type TransactionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter, which Transaction to fetch.
     */
    where?: TransactionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Transactions to fetch.
     */
    orderBy?: TransactionOrderByWithRelationInput | TransactionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Transactions.
     */
    cursor?: TransactionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Transactions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Transactions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Transactions.
     */
    distinct?: TransactionScalarFieldEnum | TransactionScalarFieldEnum[]
  }

  /**
   * Transaction findFirstOrThrow
   */
  export type TransactionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter, which Transaction to fetch.
     */
    where?: TransactionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Transactions to fetch.
     */
    orderBy?: TransactionOrderByWithRelationInput | TransactionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Transactions.
     */
    cursor?: TransactionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Transactions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Transactions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Transactions.
     */
    distinct?: TransactionScalarFieldEnum | TransactionScalarFieldEnum[]
  }

  /**
   * Transaction findMany
   */
  export type TransactionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter, which Transactions to fetch.
     */
    where?: TransactionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Transactions to fetch.
     */
    orderBy?: TransactionOrderByWithRelationInput | TransactionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Transactions.
     */
    cursor?: TransactionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Transactions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Transactions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Transactions.
     */
    distinct?: TransactionScalarFieldEnum | TransactionScalarFieldEnum[]
  }

  /**
   * Transaction create
   */
  export type TransactionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * The data needed to create a Transaction.
     */
    data: XOR<TransactionCreateInput, TransactionUncheckedCreateInput>
  }

  /**
   * Transaction createMany
   */
  export type TransactionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Transactions.
     */
    data: TransactionCreateManyInput | TransactionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Transaction createManyAndReturn
   */
  export type TransactionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * The data used to create many Transactions.
     */
    data: TransactionCreateManyInput | TransactionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Transaction update
   */
  export type TransactionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * The data needed to update a Transaction.
     */
    data: XOR<TransactionUpdateInput, TransactionUncheckedUpdateInput>
    /**
     * Choose, which Transaction to update.
     */
    where: TransactionWhereUniqueInput
  }

  /**
   * Transaction updateMany
   */
  export type TransactionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Transactions.
     */
    data: XOR<TransactionUpdateManyMutationInput, TransactionUncheckedUpdateManyInput>
    /**
     * Filter which Transactions to update
     */
    where?: TransactionWhereInput
    /**
     * Limit how many Transactions to update.
     */
    limit?: number
  }

  /**
   * Transaction updateManyAndReturn
   */
  export type TransactionUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * The data used to update Transactions.
     */
    data: XOR<TransactionUpdateManyMutationInput, TransactionUncheckedUpdateManyInput>
    /**
     * Filter which Transactions to update
     */
    where?: TransactionWhereInput
    /**
     * Limit how many Transactions to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Transaction upsert
   */
  export type TransactionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * The filter to search for the Transaction to update in case it exists.
     */
    where: TransactionWhereUniqueInput
    /**
     * In case the Transaction found by the `where` argument doesn't exist, create a new Transaction with this data.
     */
    create: XOR<TransactionCreateInput, TransactionUncheckedCreateInput>
    /**
     * In case the Transaction was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TransactionUpdateInput, TransactionUncheckedUpdateInput>
  }

  /**
   * Transaction delete
   */
  export type TransactionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
    /**
     * Filter which Transaction to delete.
     */
    where: TransactionWhereUniqueInput
  }

  /**
   * Transaction deleteMany
   */
  export type TransactionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Transactions to delete
     */
    where?: TransactionWhereInput
    /**
     * Limit how many Transactions to delete.
     */
    limit?: number
  }

  /**
   * Transaction without action
   */
  export type TransactionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Transaction
     */
    select?: TransactionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Transaction
     */
    omit?: TransactionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TransactionInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    privyDid: 'privyDid',
    walletAddress: 'walletAddress',
    stellarPublicKey: 'stellarPublicKey',
    fullName: 'fullName',
    email: 'email',
    avatarUrl: 'avatarUrl',
    totalSentUsd: 'totalSentUsd',
    transactionCount: 'transactionCount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    displayName: 'displayName',
    lastLoginAt: 'lastLoginAt',
    walletBalance: 'walletBalance'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const SavedRecipientScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    type: 'type',
    currency: 'currency',
    institutionCode: 'institutionCode',
    institutionName: 'institutionName',
    accountIdentifier: 'accountIdentifier',
    accountName: 'accountName',
    lastUsedAt: 'lastUsedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SavedRecipientScalarFieldEnum = (typeof SavedRecipientScalarFieldEnum)[keyof typeof SavedRecipientScalarFieldEnum]


  export const TransactionScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    orderId: 'orderId',
    txHash: 'txHash',
    rail: 'rail',
    stellarPaymentHash: 'stellarPaymentHash',
    anchorTransactionId: 'anchorTransactionId',
    corridor: 'corridor',
    sourceToken: 'sourceToken',
    amountUsd: 'amountUsd',
    payoutFiat: 'payoutFiat',
    status: 'status',
    recipientName: 'recipientName',
    recipientBank: 'recipientBank',
    recipientAcc: 'recipientAcc',
    recipientBankCode: 'recipientBankCode',
    createdAt: 'createdAt',
    blockNumber: 'blockNumber',
    chainId: 'chainId',
    externalId: 'externalId',
    logIndex: 'logIndex',
    updatedAt: 'updatedAt',
    type: 'type',
    refundTxHash: 'refundTxHash'
  };

  export type TransactionScalarFieldEnum = (typeof TransactionScalarFieldEnum)[keyof typeof TransactionScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Decimal'
   */
  export type DecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal'>
    


  /**
   * Reference to a field of type 'Decimal[]'
   */
  export type ListDecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'RecipientType'
   */
  export type EnumRecipientTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RecipientType'>
    


  /**
   * Reference to a field of type 'RecipientType[]'
   */
  export type ListEnumRecipientTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RecipientType[]'>
    


  /**
   * Reference to a field of type 'BigInt'
   */
  export type BigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt'>
    


  /**
   * Reference to a field of type 'BigInt[]'
   */
  export type ListBigIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'BigInt[]'>
    


  /**
   * Reference to a field of type 'RemittanceRail'
   */
  export type EnumRemittanceRailFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RemittanceRail'>
    


  /**
   * Reference to a field of type 'RemittanceRail[]'
   */
  export type ListEnumRemittanceRailFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'RemittanceRail[]'>
    


  /**
   * Reference to a field of type 'Status'
   */
  export type EnumStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Status'>
    


  /**
   * Reference to a field of type 'Status[]'
   */
  export type ListEnumStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Status[]'>
    


  /**
   * Reference to a field of type 'TransactionType'
   */
  export type EnumTransactionTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TransactionType'>
    


  /**
   * Reference to a field of type 'TransactionType[]'
   */
  export type ListEnumTransactionTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TransactionType[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    privyDid?: StringFilter<"User"> | string
    walletAddress?: StringNullableFilter<"User"> | string | null
    stellarPublicKey?: StringNullableFilter<"User"> | string | null
    fullName?: StringNullableFilter<"User"> | string | null
    email?: StringNullableFilter<"User"> | string | null
    avatarUrl?: StringNullableFilter<"User"> | string | null
    totalSentUsd?: DecimalFilter<"User"> | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFilter<"User"> | number
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    displayName?: StringNullableFilter<"User"> | string | null
    lastLoginAt?: DateTimeNullableFilter<"User"> | Date | string | null
    walletBalance?: DecimalFilter<"User"> | Decimal | DecimalJsLike | number | string
    transactions?: TransactionListRelationFilter
    savedRecipients?: SavedRecipientListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    privyDid?: SortOrder
    walletAddress?: SortOrderInput | SortOrder
    stellarPublicKey?: SortOrderInput | SortOrder
    fullName?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    displayName?: SortOrderInput | SortOrder
    lastLoginAt?: SortOrderInput | SortOrder
    walletBalance?: SortOrder
    transactions?: TransactionOrderByRelationAggregateInput
    savedRecipients?: SavedRecipientOrderByRelationAggregateInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    privyDid?: string
    walletAddress?: string
    stellarPublicKey?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    fullName?: StringNullableFilter<"User"> | string | null
    avatarUrl?: StringNullableFilter<"User"> | string | null
    totalSentUsd?: DecimalFilter<"User"> | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFilter<"User"> | number
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    displayName?: StringNullableFilter<"User"> | string | null
    lastLoginAt?: DateTimeNullableFilter<"User"> | Date | string | null
    walletBalance?: DecimalFilter<"User"> | Decimal | DecimalJsLike | number | string
    transactions?: TransactionListRelationFilter
    savedRecipients?: SavedRecipientListRelationFilter
  }, "id" | "privyDid" | "walletAddress" | "stellarPublicKey" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    privyDid?: SortOrder
    walletAddress?: SortOrderInput | SortOrder
    stellarPublicKey?: SortOrderInput | SortOrder
    fullName?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    avatarUrl?: SortOrderInput | SortOrder
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    displayName?: SortOrderInput | SortOrder
    lastLoginAt?: SortOrderInput | SortOrder
    walletBalance?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _avg?: UserAvgOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
    _sum?: UserSumOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    privyDid?: StringWithAggregatesFilter<"User"> | string
    walletAddress?: StringNullableWithAggregatesFilter<"User"> | string | null
    stellarPublicKey?: StringNullableWithAggregatesFilter<"User"> | string | null
    fullName?: StringNullableWithAggregatesFilter<"User"> | string | null
    email?: StringNullableWithAggregatesFilter<"User"> | string | null
    avatarUrl?: StringNullableWithAggregatesFilter<"User"> | string | null
    totalSentUsd?: DecimalWithAggregatesFilter<"User"> | Decimal | DecimalJsLike | number | string
    transactionCount?: IntWithAggregatesFilter<"User"> | number
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    displayName?: StringNullableWithAggregatesFilter<"User"> | string | null
    lastLoginAt?: DateTimeNullableWithAggregatesFilter<"User"> | Date | string | null
    walletBalance?: DecimalWithAggregatesFilter<"User"> | Decimal | DecimalJsLike | number | string
  }

  export type SavedRecipientWhereInput = {
    AND?: SavedRecipientWhereInput | SavedRecipientWhereInput[]
    OR?: SavedRecipientWhereInput[]
    NOT?: SavedRecipientWhereInput | SavedRecipientWhereInput[]
    id?: StringFilter<"SavedRecipient"> | string
    userId?: StringFilter<"SavedRecipient"> | string
    type?: EnumRecipientTypeFilter<"SavedRecipient"> | $Enums.RecipientType
    currency?: StringFilter<"SavedRecipient"> | string
    institutionCode?: StringFilter<"SavedRecipient"> | string
    institutionName?: StringFilter<"SavedRecipient"> | string
    accountIdentifier?: StringFilter<"SavedRecipient"> | string
    accountName?: StringFilter<"SavedRecipient"> | string
    lastUsedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    createdAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    updatedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }

  export type SavedRecipientOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    type?: SortOrder
    currency?: SortOrder
    institutionCode?: SortOrder
    institutionName?: SortOrder
    accountIdentifier?: SortOrder
    accountName?: SortOrder
    lastUsedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type SavedRecipientWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId_currency_institutionCode_accountIdentifier?: SavedRecipientUserIdCurrencyInstitutionCodeAccountIdentifierCompoundUniqueInput
    AND?: SavedRecipientWhereInput | SavedRecipientWhereInput[]
    OR?: SavedRecipientWhereInput[]
    NOT?: SavedRecipientWhereInput | SavedRecipientWhereInput[]
    userId?: StringFilter<"SavedRecipient"> | string
    type?: EnumRecipientTypeFilter<"SavedRecipient"> | $Enums.RecipientType
    currency?: StringFilter<"SavedRecipient"> | string
    institutionCode?: StringFilter<"SavedRecipient"> | string
    institutionName?: StringFilter<"SavedRecipient"> | string
    accountIdentifier?: StringFilter<"SavedRecipient"> | string
    accountName?: StringFilter<"SavedRecipient"> | string
    lastUsedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    createdAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    updatedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }, "id" | "userId_currency_institutionCode_accountIdentifier">

  export type SavedRecipientOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    type?: SortOrder
    currency?: SortOrder
    institutionCode?: SortOrder
    institutionName?: SortOrder
    accountIdentifier?: SortOrder
    accountName?: SortOrder
    lastUsedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SavedRecipientCountOrderByAggregateInput
    _max?: SavedRecipientMaxOrderByAggregateInput
    _min?: SavedRecipientMinOrderByAggregateInput
  }

  export type SavedRecipientScalarWhereWithAggregatesInput = {
    AND?: SavedRecipientScalarWhereWithAggregatesInput | SavedRecipientScalarWhereWithAggregatesInput[]
    OR?: SavedRecipientScalarWhereWithAggregatesInput[]
    NOT?: SavedRecipientScalarWhereWithAggregatesInput | SavedRecipientScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"SavedRecipient"> | string
    userId?: StringWithAggregatesFilter<"SavedRecipient"> | string
    type?: EnumRecipientTypeWithAggregatesFilter<"SavedRecipient"> | $Enums.RecipientType
    currency?: StringWithAggregatesFilter<"SavedRecipient"> | string
    institutionCode?: StringWithAggregatesFilter<"SavedRecipient"> | string
    institutionName?: StringWithAggregatesFilter<"SavedRecipient"> | string
    accountIdentifier?: StringWithAggregatesFilter<"SavedRecipient"> | string
    accountName?: StringWithAggregatesFilter<"SavedRecipient"> | string
    lastUsedAt?: DateTimeWithAggregatesFilter<"SavedRecipient"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"SavedRecipient"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SavedRecipient"> | Date | string
  }

  export type TransactionWhereInput = {
    AND?: TransactionWhereInput | TransactionWhereInput[]
    OR?: TransactionWhereInput[]
    NOT?: TransactionWhereInput | TransactionWhereInput[]
    id?: StringFilter<"Transaction"> | string
    userId?: StringFilter<"Transaction"> | string
    orderId?: BigIntFilter<"Transaction"> | bigint | number
    txHash?: StringFilter<"Transaction"> | string
    rail?: EnumRemittanceRailFilter<"Transaction"> | $Enums.RemittanceRail
    stellarPaymentHash?: StringNullableFilter<"Transaction"> | string | null
    anchorTransactionId?: StringNullableFilter<"Transaction"> | string | null
    corridor?: StringNullableFilter<"Transaction"> | string | null
    sourceToken?: StringFilter<"Transaction"> | string
    amountUsd?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFilter<"Transaction"> | $Enums.Status
    recipientName?: StringNullableFilter<"Transaction"> | string | null
    recipientBank?: StringNullableFilter<"Transaction"> | string | null
    recipientAcc?: StringNullableFilter<"Transaction"> | string | null
    recipientBankCode?: StringNullableFilter<"Transaction"> | string | null
    createdAt?: DateTimeFilter<"Transaction"> | Date | string
    blockNumber?: BigIntFilter<"Transaction"> | bigint | number
    chainId?: IntFilter<"Transaction"> | number
    externalId?: StringNullableFilter<"Transaction"> | string | null
    logIndex?: IntFilter<"Transaction"> | number
    updatedAt?: DateTimeFilter<"Transaction"> | Date | string
    type?: EnumTransactionTypeFilter<"Transaction"> | $Enums.TransactionType
    refundTxHash?: StringNullableFilter<"Transaction"> | string | null
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }

  export type TransactionOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    orderId?: SortOrder
    txHash?: SortOrder
    rail?: SortOrder
    stellarPaymentHash?: SortOrderInput | SortOrder
    anchorTransactionId?: SortOrderInput | SortOrder
    corridor?: SortOrderInput | SortOrder
    sourceToken?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    status?: SortOrder
    recipientName?: SortOrderInput | SortOrder
    recipientBank?: SortOrderInput | SortOrder
    recipientAcc?: SortOrderInput | SortOrder
    recipientBankCode?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    externalId?: SortOrderInput | SortOrder
    logIndex?: SortOrder
    updatedAt?: SortOrder
    type?: SortOrder
    refundTxHash?: SortOrderInput | SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type TransactionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    stellarPaymentHash?: string
    externalId?: string
    txHash_logIndex?: TransactionTxHashLogIndexCompoundUniqueInput
    chainId_blockNumber_logIndex?: TransactionChainIdBlockNumberLogIndexCompoundUniqueInput
    orderId_chainId?: TransactionOrderIdChainIdCompoundUniqueInput
    userId_refundTxHash?: TransactionUserIdRefundTxHashCompoundUniqueInput
    AND?: TransactionWhereInput | TransactionWhereInput[]
    OR?: TransactionWhereInput[]
    NOT?: TransactionWhereInput | TransactionWhereInput[]
    userId?: StringFilter<"Transaction"> | string
    orderId?: BigIntFilter<"Transaction"> | bigint | number
    txHash?: StringFilter<"Transaction"> | string
    rail?: EnumRemittanceRailFilter<"Transaction"> | $Enums.RemittanceRail
    anchorTransactionId?: StringNullableFilter<"Transaction"> | string | null
    corridor?: StringNullableFilter<"Transaction"> | string | null
    sourceToken?: StringFilter<"Transaction"> | string
    amountUsd?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFilter<"Transaction"> | $Enums.Status
    recipientName?: StringNullableFilter<"Transaction"> | string | null
    recipientBank?: StringNullableFilter<"Transaction"> | string | null
    recipientAcc?: StringNullableFilter<"Transaction"> | string | null
    recipientBankCode?: StringNullableFilter<"Transaction"> | string | null
    createdAt?: DateTimeFilter<"Transaction"> | Date | string
    blockNumber?: BigIntFilter<"Transaction"> | bigint | number
    chainId?: IntFilter<"Transaction"> | number
    logIndex?: IntFilter<"Transaction"> | number
    updatedAt?: DateTimeFilter<"Transaction"> | Date | string
    type?: EnumTransactionTypeFilter<"Transaction"> | $Enums.TransactionType
    refundTxHash?: StringNullableFilter<"Transaction"> | string | null
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
  }, "id" | "stellarPaymentHash" | "externalId" | "txHash_logIndex" | "chainId_blockNumber_logIndex" | "orderId_chainId" | "userId_refundTxHash">

  export type TransactionOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    orderId?: SortOrder
    txHash?: SortOrder
    rail?: SortOrder
    stellarPaymentHash?: SortOrderInput | SortOrder
    anchorTransactionId?: SortOrderInput | SortOrder
    corridor?: SortOrderInput | SortOrder
    sourceToken?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    status?: SortOrder
    recipientName?: SortOrderInput | SortOrder
    recipientBank?: SortOrderInput | SortOrder
    recipientAcc?: SortOrderInput | SortOrder
    recipientBankCode?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    externalId?: SortOrderInput | SortOrder
    logIndex?: SortOrder
    updatedAt?: SortOrder
    type?: SortOrder
    refundTxHash?: SortOrderInput | SortOrder
    _count?: TransactionCountOrderByAggregateInput
    _avg?: TransactionAvgOrderByAggregateInput
    _max?: TransactionMaxOrderByAggregateInput
    _min?: TransactionMinOrderByAggregateInput
    _sum?: TransactionSumOrderByAggregateInput
  }

  export type TransactionScalarWhereWithAggregatesInput = {
    AND?: TransactionScalarWhereWithAggregatesInput | TransactionScalarWhereWithAggregatesInput[]
    OR?: TransactionScalarWhereWithAggregatesInput[]
    NOT?: TransactionScalarWhereWithAggregatesInput | TransactionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Transaction"> | string
    userId?: StringWithAggregatesFilter<"Transaction"> | string
    orderId?: BigIntWithAggregatesFilter<"Transaction"> | bigint | number
    txHash?: StringWithAggregatesFilter<"Transaction"> | string
    rail?: EnumRemittanceRailWithAggregatesFilter<"Transaction"> | $Enums.RemittanceRail
    stellarPaymentHash?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    anchorTransactionId?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    corridor?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    sourceToken?: StringWithAggregatesFilter<"Transaction"> | string
    amountUsd?: DecimalWithAggregatesFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalWithAggregatesFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    status?: EnumStatusWithAggregatesFilter<"Transaction"> | $Enums.Status
    recipientName?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    recipientBank?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    recipientAcc?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    recipientBankCode?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Transaction"> | Date | string
    blockNumber?: BigIntWithAggregatesFilter<"Transaction"> | bigint | number
    chainId?: IntWithAggregatesFilter<"Transaction"> | number
    externalId?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
    logIndex?: IntWithAggregatesFilter<"Transaction"> | number
    updatedAt?: DateTimeWithAggregatesFilter<"Transaction"> | Date | string
    type?: EnumTransactionTypeWithAggregatesFilter<"Transaction"> | $Enums.TransactionType
    refundTxHash?: StringNullableWithAggregatesFilter<"Transaction"> | string | null
  }

  export type UserCreateInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    transactions?: TransactionCreateNestedManyWithoutUserInput
    savedRecipients?: SavedRecipientCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    transactions?: TransactionUncheckedCreateNestedManyWithoutUserInput
    savedRecipients?: SavedRecipientUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactions?: TransactionUpdateManyWithoutUserNestedInput
    savedRecipients?: SavedRecipientUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactions?: TransactionUncheckedUpdateManyWithoutUserNestedInput
    savedRecipients?: SavedRecipientUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateManyInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
  }

  export type SavedRecipientCreateInput = {
    id?: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutSavedRecipientsInput
  }

  export type SavedRecipientUncheckedCreateInput = {
    id?: string
    userId: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SavedRecipientUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutSavedRecipientsNestedInput
  }

  export type SavedRecipientUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SavedRecipientCreateManyInput = {
    id?: string
    userId: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SavedRecipientUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SavedRecipientUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TransactionCreateInput = {
    id?: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
    user: UserCreateNestedOneWithoutTransactionsInput
  }

  export type TransactionUncheckedCreateInput = {
    id?: string
    userId: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
  }

  export type TransactionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
    user?: UserUpdateOneRequiredWithoutTransactionsNestedInput
  }

  export type TransactionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TransactionCreateManyInput = {
    id?: string
    userId: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
  }

  export type TransactionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TransactionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type TransactionListRelationFilter = {
    every?: TransactionWhereInput
    some?: TransactionWhereInput
    none?: TransactionWhereInput
  }

  export type SavedRecipientListRelationFilter = {
    every?: SavedRecipientWhereInput
    some?: SavedRecipientWhereInput
    none?: SavedRecipientWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type TransactionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SavedRecipientOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    privyDid?: SortOrder
    walletAddress?: SortOrder
    stellarPublicKey?: SortOrder
    fullName?: SortOrder
    email?: SortOrder
    avatarUrl?: SortOrder
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    displayName?: SortOrder
    lastLoginAt?: SortOrder
    walletBalance?: SortOrder
  }

  export type UserAvgOrderByAggregateInput = {
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    walletBalance?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    privyDid?: SortOrder
    walletAddress?: SortOrder
    stellarPublicKey?: SortOrder
    fullName?: SortOrder
    email?: SortOrder
    avatarUrl?: SortOrder
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    displayName?: SortOrder
    lastLoginAt?: SortOrder
    walletBalance?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    privyDid?: SortOrder
    walletAddress?: SortOrder
    stellarPublicKey?: SortOrder
    fullName?: SortOrder
    email?: SortOrder
    avatarUrl?: SortOrder
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    displayName?: SortOrder
    lastLoginAt?: SortOrder
    walletBalance?: SortOrder
  }

  export type UserSumOrderByAggregateInput = {
    totalSentUsd?: SortOrder
    transactionCount?: SortOrder
    walletBalance?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type EnumRecipientTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.RecipientType | EnumRecipientTypeFieldRefInput<$PrismaModel>
    in?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumRecipientTypeFilter<$PrismaModel> | $Enums.RecipientType
  }

  export type UserScalarRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type SavedRecipientUserIdCurrencyInstitutionCodeAccountIdentifierCompoundUniqueInput = {
    userId: string
    currency: string
    institutionCode: string
    accountIdentifier: string
  }

  export type SavedRecipientCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    type?: SortOrder
    currency?: SortOrder
    institutionCode?: SortOrder
    institutionName?: SortOrder
    accountIdentifier?: SortOrder
    accountName?: SortOrder
    lastUsedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SavedRecipientMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    type?: SortOrder
    currency?: SortOrder
    institutionCode?: SortOrder
    institutionName?: SortOrder
    accountIdentifier?: SortOrder
    accountName?: SortOrder
    lastUsedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SavedRecipientMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    type?: SortOrder
    currency?: SortOrder
    institutionCode?: SortOrder
    institutionName?: SortOrder
    accountIdentifier?: SortOrder
    accountName?: SortOrder
    lastUsedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type EnumRecipientTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RecipientType | EnumRecipientTypeFieldRefInput<$PrismaModel>
    in?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumRecipientTypeWithAggregatesFilter<$PrismaModel> | $Enums.RecipientType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRecipientTypeFilter<$PrismaModel>
    _max?: NestedEnumRecipientTypeFilter<$PrismaModel>
  }

  export type BigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type EnumRemittanceRailFilter<$PrismaModel = never> = {
    equals?: $Enums.RemittanceRail | EnumRemittanceRailFieldRefInput<$PrismaModel>
    in?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    notIn?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    not?: NestedEnumRemittanceRailFilter<$PrismaModel> | $Enums.RemittanceRail
  }

  export type EnumStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.Status | EnumStatusFieldRefInput<$PrismaModel>
    in?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumStatusFilter<$PrismaModel> | $Enums.Status
  }

  export type EnumTransactionTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.TransactionType | EnumTransactionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTransactionTypeFilter<$PrismaModel> | $Enums.TransactionType
  }

  export type TransactionTxHashLogIndexCompoundUniqueInput = {
    txHash: string
    logIndex: number
  }

  export type TransactionChainIdBlockNumberLogIndexCompoundUniqueInput = {
    chainId: number
    blockNumber: bigint | number
    logIndex: number
  }

  export type TransactionOrderIdChainIdCompoundUniqueInput = {
    orderId: bigint | number
    chainId: number
  }

  export type TransactionUserIdRefundTxHashCompoundUniqueInput = {
    userId: string
    refundTxHash: string
  }

  export type TransactionCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    orderId?: SortOrder
    txHash?: SortOrder
    rail?: SortOrder
    stellarPaymentHash?: SortOrder
    anchorTransactionId?: SortOrder
    corridor?: SortOrder
    sourceToken?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    status?: SortOrder
    recipientName?: SortOrder
    recipientBank?: SortOrder
    recipientAcc?: SortOrder
    recipientBankCode?: SortOrder
    createdAt?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    externalId?: SortOrder
    logIndex?: SortOrder
    updatedAt?: SortOrder
    type?: SortOrder
    refundTxHash?: SortOrder
  }

  export type TransactionAvgOrderByAggregateInput = {
    orderId?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    logIndex?: SortOrder
  }

  export type TransactionMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    orderId?: SortOrder
    txHash?: SortOrder
    rail?: SortOrder
    stellarPaymentHash?: SortOrder
    anchorTransactionId?: SortOrder
    corridor?: SortOrder
    sourceToken?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    status?: SortOrder
    recipientName?: SortOrder
    recipientBank?: SortOrder
    recipientAcc?: SortOrder
    recipientBankCode?: SortOrder
    createdAt?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    externalId?: SortOrder
    logIndex?: SortOrder
    updatedAt?: SortOrder
    type?: SortOrder
    refundTxHash?: SortOrder
  }

  export type TransactionMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    orderId?: SortOrder
    txHash?: SortOrder
    rail?: SortOrder
    stellarPaymentHash?: SortOrder
    anchorTransactionId?: SortOrder
    corridor?: SortOrder
    sourceToken?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    status?: SortOrder
    recipientName?: SortOrder
    recipientBank?: SortOrder
    recipientAcc?: SortOrder
    recipientBankCode?: SortOrder
    createdAt?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    externalId?: SortOrder
    logIndex?: SortOrder
    updatedAt?: SortOrder
    type?: SortOrder
    refundTxHash?: SortOrder
  }

  export type TransactionSumOrderByAggregateInput = {
    orderId?: SortOrder
    amountUsd?: SortOrder
    payoutFiat?: SortOrder
    blockNumber?: SortOrder
    chainId?: SortOrder
    logIndex?: SortOrder
  }

  export type BigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type EnumRemittanceRailWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RemittanceRail | EnumRemittanceRailFieldRefInput<$PrismaModel>
    in?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    notIn?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    not?: NestedEnumRemittanceRailWithAggregatesFilter<$PrismaModel> | $Enums.RemittanceRail
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRemittanceRailFilter<$PrismaModel>
    _max?: NestedEnumRemittanceRailFilter<$PrismaModel>
  }

  export type EnumStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Status | EnumStatusFieldRefInput<$PrismaModel>
    in?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumStatusWithAggregatesFilter<$PrismaModel> | $Enums.Status
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumStatusFilter<$PrismaModel>
    _max?: NestedEnumStatusFilter<$PrismaModel>
  }

  export type EnumTransactionTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TransactionType | EnumTransactionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTransactionTypeWithAggregatesFilter<$PrismaModel> | $Enums.TransactionType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTransactionTypeFilter<$PrismaModel>
    _max?: NestedEnumTransactionTypeFilter<$PrismaModel>
  }

  export type TransactionCreateNestedManyWithoutUserInput = {
    create?: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput> | TransactionCreateWithoutUserInput[] | TransactionUncheckedCreateWithoutUserInput[]
    connectOrCreate?: TransactionCreateOrConnectWithoutUserInput | TransactionCreateOrConnectWithoutUserInput[]
    createMany?: TransactionCreateManyUserInputEnvelope
    connect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
  }

  export type SavedRecipientCreateNestedManyWithoutUserInput = {
    create?: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput> | SavedRecipientCreateWithoutUserInput[] | SavedRecipientUncheckedCreateWithoutUserInput[]
    connectOrCreate?: SavedRecipientCreateOrConnectWithoutUserInput | SavedRecipientCreateOrConnectWithoutUserInput[]
    createMany?: SavedRecipientCreateManyUserInputEnvelope
    connect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
  }

  export type TransactionUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput> | TransactionCreateWithoutUserInput[] | TransactionUncheckedCreateWithoutUserInput[]
    connectOrCreate?: TransactionCreateOrConnectWithoutUserInput | TransactionCreateOrConnectWithoutUserInput[]
    createMany?: TransactionCreateManyUserInputEnvelope
    connect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
  }

  export type SavedRecipientUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput> | SavedRecipientCreateWithoutUserInput[] | SavedRecipientUncheckedCreateWithoutUserInput[]
    connectOrCreate?: SavedRecipientCreateOrConnectWithoutUserInput | SavedRecipientCreateOrConnectWithoutUserInput[]
    createMany?: SavedRecipientCreateManyUserInputEnvelope
    connect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type TransactionUpdateManyWithoutUserNestedInput = {
    create?: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput> | TransactionCreateWithoutUserInput[] | TransactionUncheckedCreateWithoutUserInput[]
    connectOrCreate?: TransactionCreateOrConnectWithoutUserInput | TransactionCreateOrConnectWithoutUserInput[]
    upsert?: TransactionUpsertWithWhereUniqueWithoutUserInput | TransactionUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: TransactionCreateManyUserInputEnvelope
    set?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    disconnect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    delete?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    connect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    update?: TransactionUpdateWithWhereUniqueWithoutUserInput | TransactionUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: TransactionUpdateManyWithWhereWithoutUserInput | TransactionUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: TransactionScalarWhereInput | TransactionScalarWhereInput[]
  }

  export type SavedRecipientUpdateManyWithoutUserNestedInput = {
    create?: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput> | SavedRecipientCreateWithoutUserInput[] | SavedRecipientUncheckedCreateWithoutUserInput[]
    connectOrCreate?: SavedRecipientCreateOrConnectWithoutUserInput | SavedRecipientCreateOrConnectWithoutUserInput[]
    upsert?: SavedRecipientUpsertWithWhereUniqueWithoutUserInput | SavedRecipientUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: SavedRecipientCreateManyUserInputEnvelope
    set?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    disconnect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    delete?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    connect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    update?: SavedRecipientUpdateWithWhereUniqueWithoutUserInput | SavedRecipientUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: SavedRecipientUpdateManyWithWhereWithoutUserInput | SavedRecipientUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: SavedRecipientScalarWhereInput | SavedRecipientScalarWhereInput[]
  }

  export type TransactionUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput> | TransactionCreateWithoutUserInput[] | TransactionUncheckedCreateWithoutUserInput[]
    connectOrCreate?: TransactionCreateOrConnectWithoutUserInput | TransactionCreateOrConnectWithoutUserInput[]
    upsert?: TransactionUpsertWithWhereUniqueWithoutUserInput | TransactionUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: TransactionCreateManyUserInputEnvelope
    set?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    disconnect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    delete?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    connect?: TransactionWhereUniqueInput | TransactionWhereUniqueInput[]
    update?: TransactionUpdateWithWhereUniqueWithoutUserInput | TransactionUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: TransactionUpdateManyWithWhereWithoutUserInput | TransactionUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: TransactionScalarWhereInput | TransactionScalarWhereInput[]
  }

  export type SavedRecipientUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput> | SavedRecipientCreateWithoutUserInput[] | SavedRecipientUncheckedCreateWithoutUserInput[]
    connectOrCreate?: SavedRecipientCreateOrConnectWithoutUserInput | SavedRecipientCreateOrConnectWithoutUserInput[]
    upsert?: SavedRecipientUpsertWithWhereUniqueWithoutUserInput | SavedRecipientUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: SavedRecipientCreateManyUserInputEnvelope
    set?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    disconnect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    delete?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    connect?: SavedRecipientWhereUniqueInput | SavedRecipientWhereUniqueInput[]
    update?: SavedRecipientUpdateWithWhereUniqueWithoutUserInput | SavedRecipientUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: SavedRecipientUpdateManyWithWhereWithoutUserInput | SavedRecipientUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: SavedRecipientScalarWhereInput | SavedRecipientScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutSavedRecipientsInput = {
    create?: XOR<UserCreateWithoutSavedRecipientsInput, UserUncheckedCreateWithoutSavedRecipientsInput>
    connectOrCreate?: UserCreateOrConnectWithoutSavedRecipientsInput
    connect?: UserWhereUniqueInput
  }

  export type EnumRecipientTypeFieldUpdateOperationsInput = {
    set?: $Enums.RecipientType
  }

  export type UserUpdateOneRequiredWithoutSavedRecipientsNestedInput = {
    create?: XOR<UserCreateWithoutSavedRecipientsInput, UserUncheckedCreateWithoutSavedRecipientsInput>
    connectOrCreate?: UserCreateOrConnectWithoutSavedRecipientsInput
    upsert?: UserUpsertWithoutSavedRecipientsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutSavedRecipientsInput, UserUpdateWithoutSavedRecipientsInput>, UserUncheckedUpdateWithoutSavedRecipientsInput>
  }

  export type UserCreateNestedOneWithoutTransactionsInput = {
    create?: XOR<UserCreateWithoutTransactionsInput, UserUncheckedCreateWithoutTransactionsInput>
    connectOrCreate?: UserCreateOrConnectWithoutTransactionsInput
    connect?: UserWhereUniqueInput
  }

  export type BigIntFieldUpdateOperationsInput = {
    set?: bigint | number
    increment?: bigint | number
    decrement?: bigint | number
    multiply?: bigint | number
    divide?: bigint | number
  }

  export type EnumRemittanceRailFieldUpdateOperationsInput = {
    set?: $Enums.RemittanceRail
  }

  export type EnumStatusFieldUpdateOperationsInput = {
    set?: $Enums.Status
  }

  export type EnumTransactionTypeFieldUpdateOperationsInput = {
    set?: $Enums.TransactionType
  }

  export type UserUpdateOneRequiredWithoutTransactionsNestedInput = {
    create?: XOR<UserCreateWithoutTransactionsInput, UserUncheckedCreateWithoutTransactionsInput>
    connectOrCreate?: UserCreateOrConnectWithoutTransactionsInput
    upsert?: UserUpsertWithoutTransactionsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutTransactionsInput, UserUpdateWithoutTransactionsInput>, UserUncheckedUpdateWithoutTransactionsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDecimalFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDecimalWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel>
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedDecimalFilter<$PrismaModel>
    _sum?: NestedDecimalFilter<$PrismaModel>
    _min?: NestedDecimalFilter<$PrismaModel>
    _max?: NestedDecimalFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumRecipientTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.RecipientType | EnumRecipientTypeFieldRefInput<$PrismaModel>
    in?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumRecipientTypeFilter<$PrismaModel> | $Enums.RecipientType
  }

  export type NestedEnumRecipientTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RecipientType | EnumRecipientTypeFieldRefInput<$PrismaModel>
    in?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.RecipientType[] | ListEnumRecipientTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumRecipientTypeWithAggregatesFilter<$PrismaModel> | $Enums.RecipientType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRecipientTypeFilter<$PrismaModel>
    _max?: NestedEnumRecipientTypeFilter<$PrismaModel>
  }

  export type NestedBigIntFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntFilter<$PrismaModel> | bigint | number
  }

  export type NestedEnumRemittanceRailFilter<$PrismaModel = never> = {
    equals?: $Enums.RemittanceRail | EnumRemittanceRailFieldRefInput<$PrismaModel>
    in?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    notIn?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    not?: NestedEnumRemittanceRailFilter<$PrismaModel> | $Enums.RemittanceRail
  }

  export type NestedEnumStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.Status | EnumStatusFieldRefInput<$PrismaModel>
    in?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumStatusFilter<$PrismaModel> | $Enums.Status
  }

  export type NestedEnumTransactionTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.TransactionType | EnumTransactionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTransactionTypeFilter<$PrismaModel> | $Enums.TransactionType
  }

  export type NestedBigIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    in?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    notIn?: bigint[] | number[] | ListBigIntFieldRefInput<$PrismaModel>
    lt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    lte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gt?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    gte?: bigint | number | BigIntFieldRefInput<$PrismaModel>
    not?: NestedBigIntWithAggregatesFilter<$PrismaModel> | bigint | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedBigIntFilter<$PrismaModel>
    _min?: NestedBigIntFilter<$PrismaModel>
    _max?: NestedBigIntFilter<$PrismaModel>
  }

  export type NestedEnumRemittanceRailWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.RemittanceRail | EnumRemittanceRailFieldRefInput<$PrismaModel>
    in?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    notIn?: $Enums.RemittanceRail[] | ListEnumRemittanceRailFieldRefInput<$PrismaModel>
    not?: NestedEnumRemittanceRailWithAggregatesFilter<$PrismaModel> | $Enums.RemittanceRail
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumRemittanceRailFilter<$PrismaModel>
    _max?: NestedEnumRemittanceRailFilter<$PrismaModel>
  }

  export type NestedEnumStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Status | EnumStatusFieldRefInput<$PrismaModel>
    in?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.Status[] | ListEnumStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumStatusWithAggregatesFilter<$PrismaModel> | $Enums.Status
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumStatusFilter<$PrismaModel>
    _max?: NestedEnumStatusFilter<$PrismaModel>
  }

  export type NestedEnumTransactionTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TransactionType | EnumTransactionTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TransactionType[] | ListEnumTransactionTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTransactionTypeWithAggregatesFilter<$PrismaModel> | $Enums.TransactionType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTransactionTypeFilter<$PrismaModel>
    _max?: NestedEnumTransactionTypeFilter<$PrismaModel>
  }

  export type TransactionCreateWithoutUserInput = {
    id?: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
  }

  export type TransactionUncheckedCreateWithoutUserInput = {
    id?: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
  }

  export type TransactionCreateOrConnectWithoutUserInput = {
    where: TransactionWhereUniqueInput
    create: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput>
  }

  export type TransactionCreateManyUserInputEnvelope = {
    data: TransactionCreateManyUserInput | TransactionCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type SavedRecipientCreateWithoutUserInput = {
    id?: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SavedRecipientUncheckedCreateWithoutUserInput = {
    id?: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SavedRecipientCreateOrConnectWithoutUserInput = {
    where: SavedRecipientWhereUniqueInput
    create: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput>
  }

  export type SavedRecipientCreateManyUserInputEnvelope = {
    data: SavedRecipientCreateManyUserInput | SavedRecipientCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type TransactionUpsertWithWhereUniqueWithoutUserInput = {
    where: TransactionWhereUniqueInput
    update: XOR<TransactionUpdateWithoutUserInput, TransactionUncheckedUpdateWithoutUserInput>
    create: XOR<TransactionCreateWithoutUserInput, TransactionUncheckedCreateWithoutUserInput>
  }

  export type TransactionUpdateWithWhereUniqueWithoutUserInput = {
    where: TransactionWhereUniqueInput
    data: XOR<TransactionUpdateWithoutUserInput, TransactionUncheckedUpdateWithoutUserInput>
  }

  export type TransactionUpdateManyWithWhereWithoutUserInput = {
    where: TransactionScalarWhereInput
    data: XOR<TransactionUpdateManyMutationInput, TransactionUncheckedUpdateManyWithoutUserInput>
  }

  export type TransactionScalarWhereInput = {
    AND?: TransactionScalarWhereInput | TransactionScalarWhereInput[]
    OR?: TransactionScalarWhereInput[]
    NOT?: TransactionScalarWhereInput | TransactionScalarWhereInput[]
    id?: StringFilter<"Transaction"> | string
    userId?: StringFilter<"Transaction"> | string
    orderId?: BigIntFilter<"Transaction"> | bigint | number
    txHash?: StringFilter<"Transaction"> | string
    rail?: EnumRemittanceRailFilter<"Transaction"> | $Enums.RemittanceRail
    stellarPaymentHash?: StringNullableFilter<"Transaction"> | string | null
    anchorTransactionId?: StringNullableFilter<"Transaction"> | string | null
    corridor?: StringNullableFilter<"Transaction"> | string | null
    sourceToken?: StringFilter<"Transaction"> | string
    amountUsd?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFilter<"Transaction"> | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFilter<"Transaction"> | $Enums.Status
    recipientName?: StringNullableFilter<"Transaction"> | string | null
    recipientBank?: StringNullableFilter<"Transaction"> | string | null
    recipientAcc?: StringNullableFilter<"Transaction"> | string | null
    recipientBankCode?: StringNullableFilter<"Transaction"> | string | null
    createdAt?: DateTimeFilter<"Transaction"> | Date | string
    blockNumber?: BigIntFilter<"Transaction"> | bigint | number
    chainId?: IntFilter<"Transaction"> | number
    externalId?: StringNullableFilter<"Transaction"> | string | null
    logIndex?: IntFilter<"Transaction"> | number
    updatedAt?: DateTimeFilter<"Transaction"> | Date | string
    type?: EnumTransactionTypeFilter<"Transaction"> | $Enums.TransactionType
    refundTxHash?: StringNullableFilter<"Transaction"> | string | null
  }

  export type SavedRecipientUpsertWithWhereUniqueWithoutUserInput = {
    where: SavedRecipientWhereUniqueInput
    update: XOR<SavedRecipientUpdateWithoutUserInput, SavedRecipientUncheckedUpdateWithoutUserInput>
    create: XOR<SavedRecipientCreateWithoutUserInput, SavedRecipientUncheckedCreateWithoutUserInput>
  }

  export type SavedRecipientUpdateWithWhereUniqueWithoutUserInput = {
    where: SavedRecipientWhereUniqueInput
    data: XOR<SavedRecipientUpdateWithoutUserInput, SavedRecipientUncheckedUpdateWithoutUserInput>
  }

  export type SavedRecipientUpdateManyWithWhereWithoutUserInput = {
    where: SavedRecipientScalarWhereInput
    data: XOR<SavedRecipientUpdateManyMutationInput, SavedRecipientUncheckedUpdateManyWithoutUserInput>
  }

  export type SavedRecipientScalarWhereInput = {
    AND?: SavedRecipientScalarWhereInput | SavedRecipientScalarWhereInput[]
    OR?: SavedRecipientScalarWhereInput[]
    NOT?: SavedRecipientScalarWhereInput | SavedRecipientScalarWhereInput[]
    id?: StringFilter<"SavedRecipient"> | string
    userId?: StringFilter<"SavedRecipient"> | string
    type?: EnumRecipientTypeFilter<"SavedRecipient"> | $Enums.RecipientType
    currency?: StringFilter<"SavedRecipient"> | string
    institutionCode?: StringFilter<"SavedRecipient"> | string
    institutionName?: StringFilter<"SavedRecipient"> | string
    accountIdentifier?: StringFilter<"SavedRecipient"> | string
    accountName?: StringFilter<"SavedRecipient"> | string
    lastUsedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    createdAt?: DateTimeFilter<"SavedRecipient"> | Date | string
    updatedAt?: DateTimeFilter<"SavedRecipient"> | Date | string
  }

  export type UserCreateWithoutSavedRecipientsInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    transactions?: TransactionCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutSavedRecipientsInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    transactions?: TransactionUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutSavedRecipientsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutSavedRecipientsInput, UserUncheckedCreateWithoutSavedRecipientsInput>
  }

  export type UserUpsertWithoutSavedRecipientsInput = {
    update: XOR<UserUpdateWithoutSavedRecipientsInput, UserUncheckedUpdateWithoutSavedRecipientsInput>
    create: XOR<UserCreateWithoutSavedRecipientsInput, UserUncheckedCreateWithoutSavedRecipientsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutSavedRecipientsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutSavedRecipientsInput, UserUncheckedUpdateWithoutSavedRecipientsInput>
  }

  export type UserUpdateWithoutSavedRecipientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactions?: TransactionUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutSavedRecipientsInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactions?: TransactionUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutTransactionsInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    savedRecipients?: SavedRecipientCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutTransactionsInput = {
    id?: string
    privyDid: string
    walletAddress?: string | null
    stellarPublicKey?: string | null
    fullName?: string | null
    email?: string | null
    avatarUrl?: string | null
    totalSentUsd?: Decimal | DecimalJsLike | number | string
    transactionCount?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    displayName?: string | null
    lastLoginAt?: Date | string | null
    walletBalance?: Decimal | DecimalJsLike | number | string
    savedRecipients?: SavedRecipientUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutTransactionsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutTransactionsInput, UserUncheckedCreateWithoutTransactionsInput>
  }

  export type UserUpsertWithoutTransactionsInput = {
    update: XOR<UserUpdateWithoutTransactionsInput, UserUncheckedUpdateWithoutTransactionsInput>
    create: XOR<UserCreateWithoutTransactionsInput, UserUncheckedCreateWithoutTransactionsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutTransactionsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutTransactionsInput, UserUncheckedUpdateWithoutTransactionsInput>
  }

  export type UserUpdateWithoutTransactionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    savedRecipients?: SavedRecipientUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutTransactionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    privyDid?: StringFieldUpdateOperationsInput | string
    walletAddress?: NullableStringFieldUpdateOperationsInput | string | null
    stellarPublicKey?: NullableStringFieldUpdateOperationsInput | string | null
    fullName?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    avatarUrl?: NullableStringFieldUpdateOperationsInput | string | null
    totalSentUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    transactionCount?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    displayName?: NullableStringFieldUpdateOperationsInput | string | null
    lastLoginAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    walletBalance?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    savedRecipients?: SavedRecipientUncheckedUpdateManyWithoutUserNestedInput
  }

  export type TransactionCreateManyUserInput = {
    id?: string
    orderId: bigint | number
    txHash: string
    rail?: $Enums.RemittanceRail
    stellarPaymentHash?: string | null
    anchorTransactionId?: string | null
    corridor?: string | null
    sourceToken: string
    amountUsd: Decimal | DecimalJsLike | number | string
    payoutFiat: Decimal | DecimalJsLike | number | string
    status?: $Enums.Status
    recipientName?: string | null
    recipientBank?: string | null
    recipientAcc?: string | null
    recipientBankCode?: string | null
    createdAt?: Date | string
    blockNumber: bigint | number
    chainId: number
    externalId?: string | null
    logIndex: number
    updatedAt?: Date | string
    type?: $Enums.TransactionType
    refundTxHash?: string | null
  }

  export type SavedRecipientCreateManyUserInput = {
    id?: string
    type?: $Enums.RecipientType
    currency: string
    institutionCode: string
    institutionName: string
    accountIdentifier: string
    accountName: string
    lastUsedAt?: Date | string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TransactionUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TransactionUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type TransactionUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: BigIntFieldUpdateOperationsInput | bigint | number
    txHash?: StringFieldUpdateOperationsInput | string
    rail?: EnumRemittanceRailFieldUpdateOperationsInput | $Enums.RemittanceRail
    stellarPaymentHash?: NullableStringFieldUpdateOperationsInput | string | null
    anchorTransactionId?: NullableStringFieldUpdateOperationsInput | string | null
    corridor?: NullableStringFieldUpdateOperationsInput | string | null
    sourceToken?: StringFieldUpdateOperationsInput | string
    amountUsd?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    payoutFiat?: DecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string
    status?: EnumStatusFieldUpdateOperationsInput | $Enums.Status
    recipientName?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBank?: NullableStringFieldUpdateOperationsInput | string | null
    recipientAcc?: NullableStringFieldUpdateOperationsInput | string | null
    recipientBankCode?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    blockNumber?: BigIntFieldUpdateOperationsInput | bigint | number
    chainId?: IntFieldUpdateOperationsInput | number
    externalId?: NullableStringFieldUpdateOperationsInput | string | null
    logIndex?: IntFieldUpdateOperationsInput | number
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    type?: EnumTransactionTypeFieldUpdateOperationsInput | $Enums.TransactionType
    refundTxHash?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SavedRecipientUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SavedRecipientUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SavedRecipientUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumRecipientTypeFieldUpdateOperationsInput | $Enums.RecipientType
    currency?: StringFieldUpdateOperationsInput | string
    institutionCode?: StringFieldUpdateOperationsInput | string
    institutionName?: StringFieldUpdateOperationsInput | string
    accountIdentifier?: StringFieldUpdateOperationsInput | string
    accountName?: StringFieldUpdateOperationsInput | string
    lastUsedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}