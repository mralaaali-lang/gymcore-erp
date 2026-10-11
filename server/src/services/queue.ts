import Redis from 'ioredis';

let client: Redis | null = null;

function getQueue(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://redis:6379';
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: false,
    });

    client.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('Redis connected');
    });

    client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
  }
  return client;
}

const QUEUE_KEY = 'qr:checkin:queue';

export async function enqueueCheckIn(data: { memberId: string; gymId: string; timestamp: string }): Promise<void> {
  const redis = getQueue();
  await redis.lpush(QUEUE_KEY, JSON.stringify(data));
}

export async function dequeueCheckIn(): Promise<{ memberId: string; gymId: string; timestamp: string } | null> {
  const redis = getQueue();
  const item = await redis.rpop(QUEUE_KEY);
  if (!item) return null;
  return JSON.parse(item);
}

export { getQueue };
