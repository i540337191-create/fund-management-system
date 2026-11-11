import {validateServerConfig,databaseUrlFromEnv} from '../dist/config.js';
try{
 if(process.env.APP_AUTH_MODE!=='password')throw Error('Production container requires password authentication');
 validateServerConfig();process.env.DATABASE_URL=databaseUrlFromEnv();
 if(!process.env.DATABASE_URL)throw Error('Database configuration required');
 await import('./check-runtime.mjs');
 const {runMigrations}=await import('../dist/db/migrate.js');await runMigrations();
 await import('../dist/start.js');
}catch{console.error('Server startup preflight failed; check authentication, database and runtime dependencies.');process.exit(1);}
