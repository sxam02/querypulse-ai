// app/api/test-javamelody/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { JavaMelodyService } from '@/lib/services/javaMelodyService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, username, password } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: 'JavaMelody URL is required' }, { status: 400 });
    }

    const result = await JavaMelodyService.testConnection(url, username, password);
    return NextResponse.json({ success: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
