// lib/services/postgresCompareService.ts
import { Client } from 'pg';

export interface DBConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
}

export interface SchemaCompareRequest {
  sourceDb: DBConfig;
  destinationDb: DBConfig;
  components: string[]; // 'tables', 'views', 'functions', 'triggers', 'types', 'sequences'
  useDemo?: boolean;
}

// Structures for schema representations
export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  maxLength: number | null;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  indexes: { name: string; definition: string; isUnique: boolean }[];
  foreignKeys: {
    constraintName: string;
    columnName: string;
    foreignTable: string;
    foreignColumn: string;
  }[];
}

export interface ViewSchema {
  name: string;
  definition: string;
}

export interface FunctionSchema {
  name: string;
  arguments: string;
  returnType: string;
  definition: string;
}

export interface TriggerSchema {
  name: string;
  tableName: string;
  timing: string; // BEFORE, AFTER, INSTEAD OF
  event: string;  // INSERT, UPDATE, DELETE
  statement: string;
}

export interface TypeSchema {
  name: string;
  values: string[]; // for enums
  category: string; // enum, domain, base, etc.
}

export interface SequenceSchema {
  name: string;
  dataType: string;
  startValue: string;
  increment: string;
  minValue: string;
  maxValue: string;
}

export interface DatabaseSchemaSnapshot {
  tables: Record<string, TableSchema>;
  views: Record<string, ViewSchema>;
  functions: Record<string, FunctionSchema>;
  triggers: Record<string, TriggerSchema>;
  types: Record<string, TypeSchema>;
  sequences: Record<string, SequenceSchema>;
}

export interface CompareResultItem {
  name: string;
  status: 'missing' | 'extra' | 'different' | 'identical';
  details?: string; // Short human-readable explanation of drift
  ddl: string;      // Generated SQL command to apply change to destination
  sourceDef?: string; // Original SQL definition in Source
  destDef?: string;   // Original SQL definition in Destination
}

export interface CompareResult {
  summary: {
    totalDrifts: number;
    missingCount: number;
    extraCount: number;
    differentCount: number;
  };
  tables: CompareResultItem[];
  views: CompareResultItem[];
  functions: CompareResultItem[];
  triggers: CompareResultItem[];
  types: CompareResultItem[];
  sequences: CompareResultItem[];
  consolidatedScript: string;
}

export class PostgresCompareService {
  private static getClient(config: DBConfig) {
    return new Client({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: 15000,
      statement_timeout: 120000,
    });
  }

  static async testConnection(config: DBConfig): Promise<boolean> {
    const client = this.getClient(config);
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch (error: any) {
      try {
        await client.end();
      } catch (e) {}
      throw new Error(error.message || 'Connection failed');
    }
  }

  /**
   * Extract database schema metadata from live PostgreSQL database
   */
  static async extractSchema(config: DBConfig, components: string[]): Promise<DatabaseSchemaSnapshot> {
    const client = this.getClient(config);
    await client.connect();

    const snapshot: DatabaseSchemaSnapshot = {
      tables: {},
      views: {},
      functions: {},
      triggers: {},
      types: {},
      sequences: {},
    };

    try {
      // 1. TYPES & ENUMS (public schema only, skip auto-generated types)
      if (components.includes('types')) {
        const typesQuery = `
          SELECT 
            t.typname AS type_name,
            t.typtype AS type_category,
            COALESCE(ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder) FILTER (WHERE e.enumlabel IS NOT NULL), ARRAY[]::text[]) AS enum_values
          FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          LEFT JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE n.nspname = 'public'
            AND t.typtype IN ('e', 'd', 'c', 'r')
            AND t.typname NOT LIKE '\\_%'
            AND NOT EXISTS (
              SELECT 1 FROM pg_class c
              WHERE c.reltype = t.oid AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
            )
          GROUP BY t.typname, t.typtype
        `;
        const res = await client.query(typesQuery);
        res.rows.forEach((row: any) => {
          let category = 'base';
          if (row.type_category === 'e') category = 'enum';
          else if (row.type_category === 'd') category = 'domain';
          else if (row.type_category === 'c') category = 'composite';
          else if (row.type_category === 'r') category = 'range';

          snapshot.types[row.type_name] = {
            name: row.type_name,
            values: row.enum_values || [],
            category,
          };
        });
      }

      // 2. SEQUENCES (public schema only, use pg_sequences for speed)
      if (components.includes('sequences')) {
        const seqQuery = `
          SELECT 
            s.sequencename AS sequence_name,
            COALESCE(format_type(seq.seqtypid, NULL), 'bigint') AS data_type,
            s.start_value::text AS start_value,
            s.min_value::text AS minimum_value,
            s.max_value::text AS maximum_value,
            s.increment_by::text AS increment
          FROM pg_sequences s
          JOIN pg_class c ON c.relname = s.sequencename
          JOIN pg_namespace n ON c.relnamespace = n.oid
          LEFT JOIN pg_sequence seq ON seq.seqrelid = c.oid
          WHERE s.schemaname = 'public'
            AND n.nspname = 'public'
        `;
        const res = await client.query(seqQuery);
        res.rows.forEach((row: any) => {
          snapshot.sequences[row.sequence_name] = {
            name: row.sequence_name,
            dataType: row.data_type || 'bigint',
            startValue: row.start_value || '1',
            increment: row.increment || '1',
            minValue: row.minimum_value || '1',
            maxValue: row.maximum_value || '9223372036854775807',
          };
        });
      }

      // 3. TABLES (with Columns, Primary Keys, Foreign Keys, and Indexes)
      if (components.includes('tables')) {
        // Get all user tables
        const tablesRes = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);

        for (const tRow of tablesRes.rows) {
          const tableName = tRow.table_name;

          // Columns
          const colsRes = await client.query(`
            SELECT 
              column_name, 
              data_type, 
              is_nullable, 
              column_default, 
              character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
          `, [tableName]);

          const columns: ColumnInfo[] = colsRes.rows.map((c: any) => ({
            name: c.column_name,
            dataType: c.data_type,
            isNullable: c.is_nullable === 'YES',
            columnDefault: c.column_default,
            maxLength: c.character_maximum_length ? parseInt(c.character_maximum_length, 10) : null,
          }));

          // Primary Keys
          const pkRes = await client.query(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name 
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = $1
            ORDER BY kcu.ordinal_position
          `, [tableName]);
          const primaryKey = pkRes.rows.map((pk: any) => pk.column_name);

          // Foreign Keys
          const fkRes = await client.query(`
            SELECT
              tc.constraint_name,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = $1
          `, [tableName]);
          const foreignKeys = fkRes.rows.map((fk: any) => ({
            constraintName: fk.constraint_name,
            columnName: fk.column_name,
            foreignTable: fk.foreign_table_name,
            foreignColumn: fk.foreign_column_name,
          }));

          // Indexes
          const idxRes = await client.query(`
            SELECT
              schemaname,
              tablename,
              indexname,
              indexdef
            FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = $1
          `, [tableName]);
          const indexes = idxRes.rows.map((idx: any) => ({
            name: idx.indexname,
            definition: idx.indexdef,
            isUnique: idx.indexdef.includes('UNIQUE INDEX'),
          }));

          snapshot.tables[tableName] = {
            name: tableName,
            columns,
            primaryKey,
            foreignKeys,
            indexes,
          };
        }
      }

      // 4. VIEWS
      if (components.includes('views')) {
        const viewsQuery = `
          SELECT table_name, view_definition
          FROM information_schema.views
          WHERE table_schema = 'public'
        `;
        const res = await client.query(viewsQuery);
        res.rows.forEach((row: any) => {
          snapshot.views[row.table_name] = {
            name: row.table_name,
            definition: row.view_definition || '',
          };
        });
      }

      // 5. FUNCTIONS (public schema only, skip extension-owned and internal)
      if (components.includes('functions')) {
        const funcQuery = `
          WITH filtered_funcs AS (
            SELECT 
              p.oid AS func_oid,
              p.proname AS func_name,
              t.typname AS return_type
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_type t ON p.prorettype = t.oid
            JOIN pg_language l ON p.prolang = l.oid
            WHERE n.nspname = 'public'
              AND p.prokind IN ('f', 'p')
              AND l.lanname NOT IN ('internal', 'c')
              AND NOT EXISTS (
                SELECT 1 FROM pg_depend d
                JOIN pg_extension ex ON d.refobjid = ex.oid
                WHERE d.objid = p.oid AND d.deptype = 'e'
              )
            OFFSET 0
          )
          SELECT 
            func_name AS function_name,
            pg_get_functiondef(func_oid) AS definition,
            pg_get_function_arguments(func_oid) AS arguments,
            return_type
          FROM filtered_funcs
        `;
        const res = await client.query(funcQuery);
        res.rows.forEach((row: any) => {
          snapshot.functions[row.function_name] = {
            name: row.function_name,
            arguments: row.arguments || '',
            returnType: row.return_type,
            definition: row.definition || '',
          };
        });
      }

      // 6. TRIGGERS
      if (components.includes('triggers')) {
        const trigQuery = `
          SELECT 
            trigger_name, 
            event_object_table AS table_name,
            action_timing AS timing,
            event_manipulation AS event,
            action_statement AS statement
          FROM information_schema.triggers
          WHERE trigger_schema = 'public'
        `;
        const res = await client.query(trigQuery);
        res.rows.forEach((row: any) => {
          snapshot.triggers[row.trigger_name] = {
            name: row.trigger_name,
            tableName: row.table_name,
            timing: row.timing,
            event: row.event,
            statement: row.statement,
          };
        });
      }

    } finally {
      await client.end();
    }

    return snapshot;
  }

  static compareSchemas(
    source: DatabaseSchemaSnapshot,
    dest: DatabaseSchemaSnapshot,
    components: string[]
  ): CompareResult {
    // Sanitize snapshots to prevent crashes on unselected database components
    source = {
      tables: source?.tables || {},
      views: source?.views || {},
      functions: source?.functions || {},
      triggers: source?.triggers || {},
      types: source?.types || {},
      sequences: source?.sequences || {},
    };
    dest = {
      tables: dest?.tables || {},
      views: dest?.views || {},
      functions: dest?.functions || {},
      triggers: dest?.triggers || {},
      types: dest?.types || {},
      sequences: dest?.sequences || {},
    };

    const result: CompareResult = {
      summary: {
        totalDrifts: 0,
        missingCount: 0,
        extraCount: 0,
        differentCount: 0,
      },
      tables: [],
      views: [],
      functions: [],
      triggers: [],
      types: [],
      sequences: [],
      consolidatedScript: '',
    };

    let sqlStatements: string[] = [];

    // Helper to increment summary counts
    const addDrift = (status: 'missing' | 'extra' | 'different') => {
      result.summary.totalDrifts++;
      if (status === 'missing') result.summary.missingCount++;
      else if (status === 'extra') result.summary.extraCount++;
      else if (status === 'different') result.summary.differentCount++;
    };

    // 1. TYPES & ENUMS
    if (components.includes('types')) {
      const allTypes = new Set([...Object.keys(source.types), ...Object.keys(dest.types)]);
      allTypes.forEach((typeName) => {
        const src = source.types[typeName];
        const dst = dest.types[typeName];

        if (src && !dst) {
          // Missing
          addDrift('missing');
          let ddl = '';
          if (src.category === 'enum') {
            ddl = `CREATE TYPE ${typeName} AS ENUM (${src.values.map(v => `'${v}'`).join(', ')});`;
          } else {
            ddl = `-- Warning: Domain/Composite Type "${typeName}" needs manual replication\n-- CREATE TYPE ${typeName} ...;`;
          }
          result.types.push({
            name: typeName,
            status: 'missing',
            details: `Custom type ${typeName} (${src.category}) exists in source but is missing in destination.`,
            ddl,
            sourceDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          // Extra
          addDrift('extra');
          const ddl = `DROP TYPE ${typeName};`;
          result.types.push({
            name: typeName,
            status: 'extra',
            details: `Custom type ${typeName} exists in destination but not in source schema.`,
            ddl,
            destDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Compare definition
          const valuesMatch = JSON.stringify(src.values) === JSON.stringify(dst.values);
          const catMatch = src.category === dst.category;
          if (!valuesMatch || !catMatch) {
            addDrift('different');
            let ddl = '';
            let details = '';
            if (src.category === 'enum' && dst.category === 'enum') {
              // Postgres enum alter (adding new values)
              const missingValues = src.values.filter(v => !dst.values.includes(v));
              if (missingValues.length > 0) {
                ddl = missingValues.map(v => `ALTER TYPE ${typeName} ADD VALUE '${v}';`).join('\n');
                details = `Enum type ${typeName} is missing values: ${missingValues.join(', ')}.`;
              } else {
                ddl = `-- Enum values mismatched but cannot ALTER to delete values. Re-creation recommended.\n-- DROP TYPE ${typeName};\n-- CREATE TYPE ${typeName} AS ENUM (${src.values.map(v => `'${v}'`).join(', ')});`;
                details = `Enum type ${typeName} values mismatch (Source: [${src.values.join(', ')}], Dest: [${dst.values.join(', ')}]).`;
              }
            } else {
              ddl = `-- Type drift in composite/domain type "${typeName}"\n-- ALTER TYPE ${typeName} ...;`;
              details = `Custom type category or properties differ.`;
            }
            result.types.push({
              name: typeName,
              status: 'different',
              details,
              ddl,
              sourceDef: `TYPE ${typeName}: Category: ${src.category}, Values: [${src.values.join(', ')}]`,
              destDef: `TYPE ${typeName}: Category: ${dst.category}, Values: [${dst.values.join(', ')}]`,
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // 2. SEQUENCES
    if (components.includes('sequences')) {
      const allSeqs = new Set([...Object.keys(source.sequences), ...Object.keys(dest.sequences)]);
      allSeqs.forEach((seqName) => {
        const src = source.sequences[seqName];
        const dst = dest.sequences[seqName];

        if (src && !dst) {
          addDrift('missing');
          const ddl = `CREATE SEQUENCE ${seqName} START WITH ${src.startValue} INCREMENT BY ${src.increment};`;
          result.sequences.push({
            name: seqName,
            status: 'missing',
            details: `Sequence "${seqName}" is missing in Destination.`,
            ddl,
            sourceDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          addDrift('extra');
          const ddl = `DROP SEQUENCE ${seqName};`;
          result.sequences.push({
            name: seqName,
            status: 'extra',
            details: `Sequence "${seqName}" is extra in Destination.`,
            ddl,
            destDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Compare properties
          const incMatch = src.increment === dst.increment;
          const dataTypeMatch = src.dataType === dst.dataType;
          if (!incMatch || !dataTypeMatch) {
            addDrift('different');
            const ddl = `ALTER SEQUENCE ${seqName} INCREMENT BY ${src.increment};`;
            result.sequences.push({
              name: seqName,
              status: 'different',
              details: `Sequence metadata drifted (Increment: Source=${src.increment}, Dest=${dst.increment}).`,
              ddl,
              sourceDef: `Type: ${src.dataType}, Increment: ${src.increment}`,
              destDef: `Type: ${dst.dataType}, Increment: ${dst.increment}`,
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // 3. TABLES
    if (components.includes('tables')) {
      const allTables = new Set([...Object.keys(source.tables), ...Object.keys(dest.tables)]);
      allTables.forEach((tableName) => {
        const src = source.tables[tableName];
        const dst = dest.tables[tableName];

        if (src && !dst) {
          addDrift('missing');
          // Construct full CREATE TABLE script
          let ddl = `CREATE TABLE ${tableName} (\n`;
          const colLines = src.columns.map((col) => {
            let line = `  ${col.name} ${col.dataType}`;
            if (col.maxLength) line += `(${col.maxLength})`;
            if (!col.isNullable) line += ' NOT NULL';
            if (col.columnDefault) line += ` DEFAULT ${col.columnDefault}`;
            return line;
          });

          if (src.primaryKey.length > 0) {
            colLines.push(`  CONSTRAINT ${tableName}_pkey PRIMARY KEY (${src.primaryKey.join(', ')})`);
          }

          src.foreignKeys.forEach((fk) => {
            colLines.push(`  CONSTRAINT ${fk.constraintName} FOREIGN KEY (${fk.columnName}) REFERENCES ${fk.foreignTable} (${fk.foreignColumn})`);
          });

          ddl += colLines.join(',\n') + '\n);';

          // Index creation DDLs
          if (src.indexes && src.indexes.length > 0) {
            const indexDDLs = src.indexes
              .filter(idx => !idx.name.endsWith('_pkey')) // ignore primary key index which is auto-created
              .map(idx => idx.definition + ';')
              .join('\n');
            if (indexDDLs) {
              ddl += '\n\n' + indexDDLs;
            }
          }

          result.tables.push({
            name: tableName,
            status: 'missing',
            details: `Table "${tableName}" is missing in Destination.`,
            ddl,
            sourceDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          addDrift('extra');
          const ddl = `DROP TABLE ${tableName} CASCADE;`;
          result.tables.push({
            name: tableName,
            status: 'extra',
            details: `Table "${tableName}" exists in destination but not in source schema.`,
            ddl,
            destDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Compare columns & structure
          const tableAlters: string[] = [];
          const driftDetails: string[] = [];

          // Compare columns
          const srcCols = src.columns;
          const dstCols = dst.columns;

          const srcColMap = new Map(srcCols.map(c => [c.name, c]));
          const dstColMap = new Map(dstCols.map(c => [c.name, c]));

          // Find missing columns
          srcCols.forEach((srcCol) => {
            const dstCol = dstColMap.get(srcCol.name);
            if (!dstCol) {
              let addColDdl = `ALTER TABLE ${tableName} ADD COLUMN ${srcCol.name} ${srcCol.dataType}`;
              if (srcCol.maxLength) addColDdl += `(${srcCol.maxLength})`;
              if (!srcCol.isNullable) addColDdl += ' NOT NULL';
              if (srcCol.columnDefault) addColDdl += ` DEFAULT ${srcCol.columnDefault}`;
              addColDdl += ';';

              tableAlters.push(addColDdl);
              driftDetails.push(`Missing column: ${srcCol.name} (${srcCol.dataType})`);
            } else {
              // Compare data types and properties
              const typeDrift = srcCol.dataType !== dstCol.dataType || srcCol.maxLength !== dstCol.maxLength;
              const nullDrift = srcCol.isNullable !== dstCol.isNullable;
              const defaultDrift = srcCol.columnDefault !== dstCol.columnDefault;

              if (typeDrift) {
                let typeStr = srcCol.dataType;
                if (srcCol.maxLength) typeStr += `(${srcCol.maxLength})`;
                tableAlters.push(`ALTER TABLE ${tableName} ALTER COLUMN ${srcCol.name} TYPE ${typeStr};`);
                driftDetails.push(`Column type mismatch for ${srcCol.name} (Source: ${srcCol.dataType}, Dest: ${dstCol.dataType})`);
              }
              if (nullDrift) {
                const action = srcCol.isNullable ? 'DROP NOT NULL' : 'SET NOT NULL';
                tableAlters.push(`ALTER TABLE ${tableName} ALTER COLUMN ${srcCol.name} ${action};`);
                driftDetails.push(`Column nullability mismatch for ${srcCol.name} (Source: ${srcCol.isNullable ? 'NULL' : 'NOT NULL'}, Dest: ${dstCol.isNullable ? 'NULL' : 'NOT NULL'})`);
              }
              if (defaultDrift) {
                const action = srcCol.columnDefault ? `SET DEFAULT ${srcCol.columnDefault}` : 'DROP DEFAULT';
                tableAlters.push(`ALTER TABLE ${tableName} ALTER COLUMN ${srcCol.name} ${action};`);
                driftDetails.push(`Column default mismatch for ${srcCol.name}`);
              }
            }
          });

          // Find extra columns
          dstCols.forEach((dstCol) => {
            if (!srcColMap.has(dstCol.name)) {
              tableAlters.push(`ALTER TABLE ${tableName} DROP COLUMN ${dstCol.name};`);
              driftDetails.push(`Extra column: ${dstCol.name}`);
            }
          });

          // Compare Indexes
          const srcIndexes = src.indexes || [];
          const dstIndexes = dst.indexes || [];
          const srcIndexMap = new Map(srcIndexes.map(i => [i.name, i]));
          const dstIndexMap = new Map(dstIndexes.map(i => [i.name, i]));

          // Missing indexes
          srcIndexes.forEach((srcIdx) => {
            if (srcIdx.name.endsWith('_pkey')) return; // ignore primary keys
            if (!dstIndexMap.has(srcIdx.name)) {
              tableAlters.push(srcIdx.definition + ';');
              driftDetails.push(`Missing index: ${srcIdx.name}`);
            }
          });

          // Extra indexes
          dstIndexes.forEach((dstIdx) => {
            if (dstIdx.name.endsWith('_pkey')) return;
            if (!srcIndexMap.has(dstIdx.name)) {
              tableAlters.push(`DROP INDEX ${dstIdx.name};`);
              driftDetails.push(`Extra index: ${dstIdx.name}`);
            }
          });

          if (tableAlters.length > 0) {
            addDrift('different');
            const ddl = tableAlters.join('\n');
            result.tables.push({
              name: tableName,
              status: 'different',
              details: driftDetails.join('; '),
              ddl,
              sourceDef: `-- Source Table structure\n` + JSON.stringify(src, null, 2),
              destDef: `-- Destination Table structure\n` + JSON.stringify(dst, null, 2),
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // 4. VIEWS
    if (components.includes('views')) {
      const allViews = new Set([...Object.keys(source.views), ...Object.keys(dest.views)]);
      allViews.forEach((viewName) => {
        const src = source.views[viewName];
        const dst = dest.views[viewName];

        if (src && !dst) {
          addDrift('missing');
          const ddl = `CREATE OR REPLACE VIEW ${viewName} AS\n${src.definition.trim()};`;
          result.views.push({
            name: viewName,
            status: 'missing',
            details: `View "${viewName}" is missing in Destination.`,
            ddl,
            sourceDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          addDrift('extra');
          const ddl = `DROP VIEW ${viewName};`;
          result.views.push({
            name: viewName,
            status: 'extra',
            details: `View "${viewName}" exists in destination but not in source schema.`,
            ddl,
            destDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Normalize whitespace and compare definition queries
          const cleanSrc = src.definition.replace(/\s+/g, ' ').trim();
          const cleanDst = dst.definition.replace(/\s+/g, ' ').trim();

          if (cleanSrc !== cleanDst) {
            addDrift('different');
            const ddl = `CREATE OR REPLACE VIEW ${viewName} AS\n${src.definition.trim()};`;
            result.views.push({
              name: viewName,
              status: 'different',
              details: `View "${viewName}" definition query drifted from source schema.`,
              ddl,
              sourceDef: src.definition,
              destDef: dst.definition,
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // 5. FUNCTIONS
    if (components.includes('functions')) {
      const allFuncs = new Set([...Object.keys(source.functions), ...Object.keys(dest.functions)]);
      allFuncs.forEach((funcName) => {
        const src = source.functions[funcName];
        const dst = dest.functions[funcName];

        if (src && !dst) {
          addDrift('missing');
          const ddl = src.definition.trim() + ';';
          result.functions.push({
            name: funcName,
            status: 'missing',
            details: `Function "${funcName}" is missing in Destination database.`,
            ddl,
            sourceDef: src.definition,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          addDrift('extra');
          const ddl = `DROP FUNCTION ${funcName}(${dst.arguments});`;
          result.functions.push({
            name: funcName,
            status: 'extra',
            details: `Function "${funcName}" exists in destination but not in source schema.`,
            ddl,
            destDef: dst.definition,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Compare definition
          const cleanSrc = src.definition.replace(/\s+/g, ' ').trim();
          const cleanDst = dst.definition.replace(/\s+/g, ' ').trim();

          if (cleanSrc !== cleanDst) {
            addDrift('different');
            const ddl = src.definition.trim() + ';';
            result.functions.push({
              name: funcName,
              status: 'different',
              details: `Function body or declaration definition changed in source schema.`,
              ddl,
              sourceDef: src.definition,
              destDef: dst.definition,
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // 6. TRIGGERS
    if (components.includes('triggers')) {
      const allTrigs = new Set([...Object.keys(source.triggers), ...Object.keys(dest.triggers)]);
      allTrigs.forEach((trigName) => {
        const src = source.triggers[trigName];
        const dst = dest.triggers[trigName];

        if (src && !dst) {
          addDrift('missing');
          const ddl = `CREATE TRIGGER ${trigName} ${src.timing} ${src.event} ON ${src.tableName}\nFOR EACH ROW ${src.statement};`;
          result.triggers.push({
            name: trigName,
            status: 'missing',
            details: `Trigger "${trigName}" on table "${src.tableName}" is missing in Destination.`,
            ddl,
            sourceDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (!src && dst) {
          addDrift('extra');
          const ddl = `DROP TRIGGER ${trigName} ON ${dst.tableName};`;
          result.triggers.push({
            name: trigName,
            status: 'extra',
            details: `Trigger "${trigName}" is present in destination but not in source schema.`,
            ddl,
            destDef: ddl,
          });
          sqlStatements.push(ddl);
        } else if (src && dst) {
          // Compare
          const timingMatch = src.timing === dst.timing;
          const eventMatch = src.event === dst.event;
          const tableMatch = src.tableName === dst.tableName;
          const stmtMatch = src.statement.replace(/\s+/g, ' ').trim() === dst.statement.replace(/\s+/g, ' ').trim();

          if (!timingMatch || !eventMatch || !tableMatch || !stmtMatch) {
            addDrift('different');
            const ddl = `DROP TRIGGER ${trigName} ON ${dst.tableName};\nCREATE TRIGGER ${trigName} ${src.timing} ${src.event} ON ${src.tableName}\nFOR EACH ROW ${src.statement};`;
            result.triggers.push({
              name: trigName,
              status: 'different',
              details: `Trigger properties or action statement mismatched.`,
              ddl,
              sourceDef: `TRIGGER ${trigName} ${src.timing} ${src.event} ON ${src.tableName} FOR EACH ROW ${src.statement}`,
              destDef: `TRIGGER ${trigName} ${dst.timing} ${dst.event} ON ${dst.tableName} FOR EACH ROW ${dst.statement}`,
            });
            sqlStatements.push(ddl);
          }
        }
      });
    }

    // Consolidated script wrapper
    if (sqlStatements.length > 0) {
      result.consolidatedScript = `
-- ===========================================================================
-- QueryPulse Database Migration & Schema Deployment Script
-- Generated: ${new Date().toISOString()}
-- Source: ${Object.keys(source.tables).length > 0 ? 'Production Snapshot' : 'Live Source'}
-- Destination: Target Environment
-- ===========================================================================

BEGIN;

${sqlStatements.join('\n\n')}

COMMIT;
`.trim();
    } else {
      result.consolidatedScript = `-- No schema differences detected. Both databases are completely aligned.`;
    }

    return result;
  }

  /**
   * High-fidelity Mock data generator for Demo Mode
   */
  static getDemoSnapshot(target: 'source' | 'destination'): DatabaseSchemaSnapshot {
    // 1. Types & Enums
    const sourceTypes: Record<string, TypeSchema> = {
      'order_status_enum': {
        name: 'order_status_enum',
        values: ['draft', 'pending', 'paid', 'shipped', 'cancelled', 'refunded'],
        category: 'enum'
      },
      'user_role_domain': {
        name: 'user_role_domain',
        values: [],
        category: 'domain'
      }
    };
    const destTypes: Record<string, TypeSchema> = {
      'order_status_enum': {
        name: 'order_status_enum',
        values: ['draft', 'pending', 'paid', 'shipped', 'cancelled'],
        category: 'enum'
      }
    };

    // 2. Sequences
    const sourceSeqs: Record<string, SequenceSchema> = {
      'order_id_seq': {
        name: 'order_id_seq',
        dataType: 'bigint',
        startValue: '1',
        increment: '1',
        minValue: '1',
        maxValue: '9223372036854775807'
      },
      'product_id_seq': {
        name: 'product_id_seq',
        dataType: 'bigint',
        startValue: '1000',
        increment: '1',
        minValue: '1',
        maxValue: '9223372036854775807'
      }
    };
    const destSeqs: Record<string, SequenceSchema> = {
      'product_id_seq': {
        name: 'product_id_seq',
        dataType: 'bigint',
        startValue: '1000',
        increment: '5', // Mismatch increment
        minValue: '1',
        maxValue: '9223372036854775807'
      }
    };

    // 3. Tables
    const sourceTables: Record<string, TableSchema> = {
      'users': {
        name: 'users',
        columns: [
          { name: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'gen_random_uuid()', maxLength: null },
          { name: 'email', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 255 },
          { name: 'password_hash', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 255 },
          { name: 'first_name', dataType: 'character varying', isNullable: true, columnDefault: null, maxLength: 100 },
          { name: 'last_name', dataType: 'character varying', isNullable: true, columnDefault: null, maxLength: 100 },
          { name: 'phone_number', dataType: 'character varying', isNullable: true, columnDefault: null, maxLength: 20 },
          { name: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'now()', maxLength: null }
        ],
        primaryKey: ['id'],
        indexes: [
          { name: 'users_pkey', definition: 'CREATE UNIQUE INDEX users_pkey ON users(id)', isUnique: true },
          { name: 'idx_users_email', definition: 'CREATE UNIQUE INDEX idx_users_email ON users(email)', isUnique: true }
        ],
        foreignKeys: []
      },
      'roles': {
        name: 'roles',
        columns: [
          { name: 'id', dataType: 'integer', isNullable: false, columnDefault: null, maxLength: null },
          { name: 'name', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 50 },
          { name: 'permissions', dataType: 'text', isNullable: true, columnDefault: null, maxLength: null }
        ],
        primaryKey: ['id'],
        indexes: [
          { name: 'roles_pkey', definition: 'CREATE UNIQUE INDEX roles_pkey ON roles(id)', isUnique: true }
        ],
        foreignKeys: []
      },
      'orders': {
        name: 'orders',
        columns: [
          { name: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'gen_random_uuid()', maxLength: null },
          { name: 'user_id', dataType: 'uuid', isNullable: false, columnDefault: null, maxLength: null },
          { name: 'status', dataType: 'order_status_enum', isNullable: false, columnDefault: "'draft'::order_status_enum", maxLength: null },
          { name: 'total_amount', dataType: 'numeric', isNullable: false, columnDefault: '0.00', maxLength: null },
          { name: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'now()', maxLength: null }
        ],
        primaryKey: ['id'],
        indexes: [
          { name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON orders(id)', isUnique: true },
          { name: 'idx_orders_user_id', definition: 'CREATE INDEX idx_orders_user_id ON orders(user_id)', isUnique: false }
        ],
        foreignKeys: [
          { constraintName: 'fk_orders_users', columnName: 'user_id', foreignTable: 'users', foreignColumn: 'id' }
        ]
      },
      'audit_logs': {
        name: 'audit_logs',
        columns: [
          { name: 'id', dataType: 'bigint', isNullable: false, columnDefault: "nextval('order_id_seq')", maxLength: null },
          { name: 'event', dataType: 'text', isNullable: false, columnDefault: null, maxLength: null },
          { name: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'now()', maxLength: null }
        ],
        primaryKey: ['id'],
        indexes: [],
        foreignKeys: []
      }
    };
    const destTables: Record<string, TableSchema> = {
      'users': {
        name: 'users',
        columns: [
          { name: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'gen_random_uuid()', maxLength: null },
          { name: 'email', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 100 },
          { name: 'password_hash', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 255 },
          { name: 'first_name', dataType: 'character varying', isNullable: true, columnDefault: null, maxLength: 100 },
          { name: 'last_name', dataType: 'character varying', isNullable: true, columnDefault: null, maxLength: 100 },
          { name: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'now()', maxLength: null }
        ],
        primaryKey: ['id'],
        indexes: [
          { name: 'users_pkey', definition: 'CREATE UNIQUE INDEX users_pkey ON users(id)', isUnique: true }
        ],
        foreignKeys: []
      },
      'roles': {
        name: 'roles',
        columns: [
          { name: 'id', dataType: 'integer', isNullable: false, columnDefault: null, maxLength: null },
          { name: 'name', dataType: 'character varying', isNullable: false, columnDefault: null, maxLength: 50 }
        ],
        primaryKey: ['id'],
        indexes: [
          { name: 'roles_pkey', definition: 'CREATE UNIQUE INDEX roles_pkey ON roles(id)', isUnique: true }
        ],
        foreignKeys: []
      },
      'legacy_backup_table': {
        name: 'legacy_backup_table',
        columns: [
          { name: 'backup_id', dataType: 'integer', isNullable: false, columnDefault: null, maxLength: null },
          { name: 'data', dataType: 'text', isNullable: true, columnDefault: null, maxLength: null }
        ],
        primaryKey: ['backup_id'],
        indexes: [],
        foreignKeys: []
      }
    };

    // 4. Views
    const sourceViews: Record<string, ViewSchema> = {
      'active_users_view': {
        name: 'active_users_view',
        definition: 'SELECT id, email, first_name FROM users WHERE created_at > now() - interval \'30 days\''
      },
      'orders_summary_view': {
        name: 'orders_summary_view',
        definition: 'SELECT u.email, count(o.id) as orders_count FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.email'
      }
    };
    const destViews: Record<string, ViewSchema> = {
      'orders_summary_view': {
        name: 'orders_summary_view',
        definition: 'SELECT u.email, count(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.email'
      }
    };

    // 5. Functions
    const sourceFuncs: Record<string, FunctionSchema> = {
      'calculate_tax': {
        name: 'calculate_tax',
        arguments: 'amount numeric, rate numeric DEFAULT 0.08',
        returnType: 'numeric',
        definition: `CREATE OR REPLACE FUNCTION public.calculate_tax(amount numeric, rate numeric DEFAULT 0.08)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN amount * rate;
END;
$function$`
      },
      'log_user_event': {
        name: 'log_user_event',
        arguments: 'user_id uuid, event_desc text',
        returnType: 'void',
        definition: `CREATE OR REPLACE FUNCTION public.log_user_event(user_id uuid, event_desc text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO audit_logs(event, created_at) VALUES (event_desc, now());
END;
$function$`
      }
    };
    const destFuncs: Record<string, FunctionSchema> = {
      'calculate_tax': {
        name: 'calculate_tax',
        arguments: 'amount numeric, rate numeric DEFAULT 0.08',
        returnType: 'numeric',
        definition: `CREATE OR REPLACE FUNCTION public.calculate_tax(amount numeric, rate numeric DEFAULT 0.05)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN amount * rate;
END;
$function$`
      },
      'legacy_sync_func': {
        name: 'legacy_sync_func',
        arguments: '',
        returnType: 'trigger',
        definition: `CREATE OR REPLACE FUNCTION public.legacy_sync_func()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN NEW;
END;
$function$`
      }
    };

    // 6. Triggers
    const sourceTrigs: Record<string, TriggerSchema> = {
      'trg_log_user_event': {
        name: 'trg_log_user_event',
        tableName: 'users',
        timing: 'AFTER UPDATE',
        event: 'UPDATE',
        statement: 'EXECUTE FUNCTION log_user_event(NEW.id, \'User profile updated\')'
      }
    };
    const destTrigs: Record<string, TriggerSchema> = {
      'legacy_backup_trigger': {
        name: 'legacy_backup_trigger',
        tableName: 'legacy_backup_table',
        timing: 'BEFORE INSERT',
        event: 'INSERT',
        statement: 'EXECUTE FUNCTION legacy_sync_func()'
      }
    };

    if (target === 'source') {
      return {
        types: sourceTypes,
        sequences: sourceSeqs,
        tables: sourceTables,
        views: sourceViews,
        functions: sourceFuncs,
        triggers: sourceTrigs
      };
    } else {
      return {
        types: destTypes,
        sequences: destSeqs,
        tables: destTables,
        views: destViews,
        functions: destFuncs,
        triggers: destTrigs
      };
    }
  }

  static getDemoComparison(components: string[]): CompareResult {
    const sourceSnapshot = this.getDemoSnapshot('source');
    const destSnapshot = this.getDemoSnapshot('destination');
    return this.compareSchemas(sourceSnapshot, destSnapshot, components);
  }
}
