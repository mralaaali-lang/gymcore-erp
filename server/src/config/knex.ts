import knexLib, { Knex } from 'knex';
import config from './knexfile';

const knex: Knex = knexLib(config);

export default knex;
