import Head from 'next/head';
import dynamic from 'next/dynamic';

const RedRocksMap = dynamic(() => import('../src/components/RedRocksMap'), { ssr: false });

export default function RedRocksPage() {
  return (
    <>
      <Head>
        <title>Red Rocks AI Map</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>
      <RedRocksMap />
    </>
  );
}


