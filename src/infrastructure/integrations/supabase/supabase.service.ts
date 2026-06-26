import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor(private readonly config: ConfigService) {
    const url = config.get<string>('supabase.url');
    const key = config.get<string>('supabase.serviceRoleKey');
    this.client =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false },
            global: { fetch: fetch as typeof globalThis.fetch },
            realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
          })
        : null;
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }
}
