'use client';
// The old quick look is now Case home (/). Old links still land there, with the case they named.
import {useEffect} from 'react';
import type {ReactElement} from 'react';
import {useRouter} from 'next/navigation';

export default function DashboardRedirect(): ReactElement {
  const router = useRouter();
  useEffect(() => {
    const inv = new URLSearchParams(window.location.search).get('inv');
    router.replace(inv ? `/?inv=${encodeURIComponent(inv)}` : '/');
  }, [router]);
  return <p className="cv-moved">The quick look is now the case home. Opening it…</p>;
}
