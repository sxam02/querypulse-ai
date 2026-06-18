// app/api/profiles/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PROFILES_FILE = path.join(process.cwd(), 'profiles.json');

const DEFAULT_PROFILES = [
  {
    id: 'prof-staging',
    name: 'Staging Replica (Demo)',
    host: 'demo-source',
    port: '5432',
    database: 'staging_ecommerce',
    username: 'admin',
    password: '••••••••'
  },
  {
    id: 'prof-prod',
    name: 'Production DB (Demo)',
    host: 'demo-destination',
    port: '5432',
    database: 'production_ecommerce',
    username: 'root',
    password: '••••••••'
  }
];

export async function GET() {
  try {
    let data;
    try {
      data = await fs.readFile(PROFILES_FILE, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // If file doesn't exist, create it with default profiles
        await fs.writeFile(PROFILES_FILE, JSON.stringify(DEFAULT_PROFILES, null, 2), 'utf-8');
        return NextResponse.json(DEFAULT_PROFILES);
      }
      throw err;
    }
    return NextResponse.json(JSON.parse(data));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read profiles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload must be an array of profiles' }, { status: 400 });
    }
    await fs.writeFile(PROFILES_FILE, JSON.stringify(body, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save profiles' }, { status: 500 });
  }
}
