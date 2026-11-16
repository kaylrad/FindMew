import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { request, setTokenProvider } from './lib/api';
import {
  readSnapshot,
  writeSnapshot,
  clearPrivateData,
  cacheGeneration,
  deletePhoto,
} from './lib/cache';

const Context = createContext();
export const useApp = () => useContext(Context);

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [session, setSession] = useState(null);
  const [data, setData] = useState(null);
  const [collections, setCollections] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [savedAt, setSavedAt] = useState(null);
  const [cached, setCached] = useState(false);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const auth = useRef(null);
  const sessionRef = useRef(null);
  const lock = useRef(false);
  const keys = useRef({});
  const toastTimer = useRef(null);
  const loadId = useRef(0);
  const signedOut = useRef(false);
  const loadedUid = useRef(null);
  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const acceptSession = useCallback((s) => {
    sessionRef.current = s;
    setSession(s);
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    const unreachable = () => setOnline(false);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    window.addEventListener('findmew:unreachable', unreachable);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
      window.removeEventListener('findmew:unreachable', unreachable);
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (online) return;
    let alive = true;
    let pending = false;
    const probe = async () => {
      if (!navigator.onLine || pending) return;
      pending = true;
      try {
        await request('/health', { publicRequest: true });
        if (alive) setOnline(true);
      } catch {
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(probe, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [online]);
  useEffect(() => {
    let alive = true;
    let subscription;
    (async () => {
      try {
        let c;
        try {
          c = await request('/config', { publicRequest: true });
          localStorage.setItem('findmew-config', JSON.stringify(c));
        } catch (e) {
          c = JSON.parse(localStorage.getItem('findmew-config') || 'null');
          if (!c) throw e;
        }
        if (!alive) return;
        setConfig(c);
        if (c.demo) {
          const s = JSON.parse(localStorage.getItem('findmew-demo') || 'null');
          if (s && s.expires_at > Date.now()) acceptSession(s);
          setTokenProvider(async () => sessionRef.current?.access_token);
        } else {
          const { createClient } = await import('@supabase/supabase-js');
          if (!alive) return;
          const client = createClient(c.supabase.url, c.supabase.anonKey, {
            auth: { storageKey: 'findmew-auth' },
          });
          auth.current = client;
          setTokenProvider(async () => {
            if (!sessionRef.current) return null;
            const { data } = await client.auth.getSession();
            return data.session?.access_token;
          });
          const { data } = await client.auth.getSession();
          if (alive) acceptSession(data.session);
          subscription = client.auth.onAuthStateChange((_, s) => {
            if (alive && !signedOut.current) {
              acceptSession(s);
              if (!s) {
                loadId.current++;
                setData(null);
                setCollections([]);
                clearPrivateData();
              }
            }
          }).data.subscription;
        }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, [acceptSession]);
  const refresh = useCallback(
    async ({ append = false } = {}) => {
      const current = sessionRef.current;
      if (!current) return;
      const uid = current.user.id;
      const generation = cacheGeneration();
      const ticket = ++loadId.current;
      setError('');
      try {
        if (!navigator.onLine) {
          const cache = await readSnapshot(uid);
          if (ticket !== loadId.current) return;
          if (cache) {
            setData(cache.data);
            setCollections(cache.collections);
            setTotal(cache.total);
            setSavedAt(cache.savedAt);
            setCached(true);
          } else
            setError(
              'Belum ada data tersimpan di perangkat ini. Hubungkan internet untuk memuat koleksi.'
            );
          return;
        }
        const [state, list] = await Promise.all([
          request('/me'),
          request(`/collections?limit=20&offset=${append ? collections.length : 0}`),
        ]);
        if (
          ticket !== loadId.current ||
          sessionRef.current?.user.id !== uid ||
          generation !== cacheGeneration()
        )
          return;
        const items = append
          ? [...collections, ...list.items.filter((i) => !collections.some((c) => c.id === i.id))]
          : list.items;
        setData(state);
        setCollections(items);
        setTotal(list.total);
        setCached(false);
        setSavedAt(new Date().toISOString());
        await writeSnapshot(
          uid,
          { data: state, collections: items, total: list.total },
          generation
        );
      } catch (e) {
        if (ticket !== loadId.current) return;
        setError(e.message);
        const cache = await readSnapshot(uid);
        if (ticket === loadId.current && cache) {
          setData(cache.data);
          setCollections(cache.collections);
          setTotal(cache.total);
          setSavedAt(cache.savedAt);
          setCached(true);
        }
      }
    },
    [collections]
  );
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (session) {
      if (loadedUid.current !== session.user.id) {
        setData(null);
        setCollections([]);
        setTotal(0);
        loadedUid.current = session.user.id;
      }
      setLoading(true);
      refreshRef.current().finally(() => setLoading(false));
    } else {
      loadedUid.current = null;
      setData(null);
      setCollections([]);
      setCached(false);
      setSavedAt(null);
    }
  }, [session?.user.id, online]);
  useEffect(() => {
    const expired = () => {
      signedOut.current = true;
      loadId.current++;
      acceptSession(null);
      setData(null);
      setCollections([]);
      clearPrivateData();
      auth.current?.auth.signOut({ scope: 'local' });
      notify('Sesimu berakhir. Silakan masuk lagi.', 'error');
    };
    window.addEventListener('findmew:expired', expired);
    return () => window.removeEventListener('findmew:expired', expired);
  }, [acceptSession, notify]);
  async function login(email, password, name) {
    if (config.demo) {
      const s = await request('/demo/session', { method: 'POST', publicRequest: true });
      localStorage.setItem('findmew-demo', JSON.stringify(s));
      acceptSession(s);
      return;
    }
    const result = name
      ? await auth.current.auth.signUp({
          email,
          password,
          options: { data: { name }, emailRedirectTo: window.location.origin },
        })
      : await auth.current.auth.signInWithPassword({ email, password });
    if (result.error) throw new Error(result.error.message);
    signedOut.current = false;
    if (name && !result.data.session) notify('Cek email untuk mengonfirmasi akun, lalu masuk.');
    else acceptSession(result.data.session);
  }
  async function logout() {
    signedOut.current = true;
    loadId.current++;
    acceptSession(null);
    setData(null);
    setCollections([]);
    keys.current = {};
    await clearPrivateData();
    if (auth.current) await auth.current.auth.signOut({ scope: 'local' });
    notify('Kamu sudah keluar. Data privat lokal dibersihkan.');
  }
  async function mutate(path, body, { method = 'POST', action = path, onSuccess, message } = {}) {
    if (lock.current) return null;
    if (!navigator.onLine) {
      notify('Sambungkan internet untuk melanjutkan.', 'error');
      return null;
    }
    lock.current = true;
    setBusy(true);
    keys.current[action] ||= crypto.randomUUID();
    try {
      const result = await request(path, { method, body, key: keys.current[action] });
      delete keys.current[action];
      if (method === 'DELETE' && path.startsWith('/collections/'))
        await deletePhoto(sessionRef.current?.user.id, path.split('/').pop());
      await refreshRef.current();
      if (message) notify(typeof message === 'function' ? message(result) : message);
      onSuccess?.(result);
      return result;
    } catch (e) {
      notify(e.message, 'error');
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        config,
        session,
        data,
        collections,
        total,
        loading,
        error,
        online,
        cached,
        savedAt,
        toast,
        notify,
        busy,
        login,
        logout,
        mutate,
        refresh: () => refreshRef.current(),
        loadMore: () => refreshRef.current({ append: true }),
      }}
    >
      {children}
    </Context.Provider>
  );
}
