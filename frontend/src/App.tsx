import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios"; // Axios 임포트
import "./App.css";

interface PokemonBasicInfo {
  id: string;
  name: string;
  types: string[];
  animatedImageUrl: string | null;
  defaultImageUrl: string;
}

function App() {
  const [pokemons, setPokemons] = useState<PokemonBasicInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(false); // 초기 로딩 (첫 렌더링 시)
  const [hasMore, setHasMore] = useState<boolean>(true); // 더 가져올 데이터가 있는지 여부
  const [page, setPage] = useState<number>(0); // 현재 페이지 (offset 계산용)
  const [error, setError] = useState<string | null>(null);

  const observerRef = useRef<HTMLDivElement | null>(null); // Intersection Observer의 대상이 될 요소
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const LIMIT = 20; // 한 번에 가져올 포켓몬 개수

  const initialLoadCompletedRef = useRef(false);
  const currentPageForFetchRef = useRef(page);

  useEffect(() => {
    currentPageForFetchRef.current = page;
  }, [page]);

  // 포켓몬 데이터를 가져오는 함수
  // fetchPokemonBasicInfo가 불필요하게 생성되지 않도록 useCallback 사용
  const fetchPokemonBasicInfo = useCallback(async (currentPageToFetch: number) => {
    try {
      console.log(`DEBUG: API 요청 실행 - offset: ${currentPageToFetch * LIMIT}, limit: ${LIMIT}`);
      const response = await axios.get(`${API_BASE_URL}/pokemons`, {
        params: {
          offset: currentPageToFetch * LIMIT,
          limit: LIMIT,
        },
      });
      return response.data.results;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('포켓몬 데이터를 가져오는 중 오류 발생:', err.message);
        setError(`포켓몬 데이터를 불러오는 데 실패했습니다: ${err.message}`);
      } else {
        console.error('알 수 없는 오류 발생:', err);
        setError('알 수 없는 오류가 발생했습니다.');
      }
      setHasMore(false);
      return []; // 에러 발생 시 빈 배열 반환
    }
  }, [API_BASE_URL, LIMIT]);

  // 데이터를 불러오고 상태를 업데이트하는 통합 로직
  const loadMorePokemons = useCallback(async () => {
    // 이미 로딩 중이거나 더 가져올 데이터가 없다면 중복 요청 방지
    if (loading || !hasMore) {
        console.log("DEBUG: loadMorePokemons 요청 중지 - 로딩 중:", loading, "hasMore:", hasMore);
        return;
    }

    setLoading(true); // 로딩 시작
    setError(null); // 에러 상태 초기화

    try {
      const newPokemons = await fetchPokemonBasicInfo(currentPageForFetchRef.current);
      
      setPokemons(oldPokemons => {
          // 중복 추가 방지 로직: 이미 존재하는 id는 추가하지 않음, 중복 데이터가 발생하는 문제를 직접적으로 방어
          const newUniquePokemons = newPokemons.filter((newPoke: { id: string; }) => !oldPokemons.some(oldPoke => oldPoke.id === newPoke.id));
          return [...oldPokemons, ...newUniquePokemons];
      });
      setHasMore(newPokemons.length === LIMIT); // 받아온 데이터가 limit 개수와 같으면 더 가져올 데이터가 있을 것으로 판단
      setPage(prevPage => prevPage + 1); // 데이터 로드가 성공적으로 완료된 후 페이지 증가

    } catch (err) {
        // fetchPokemonBasicInfo 내부에서 이미 에러 처리
        console.error("loadMorePokemons에서 예상치 못한 오류:", err);
    } finally {
        setLoading(false); // 로딩 종료
    }
  }, [loading, hasMore, fetchPokemonBasicInfo]); // 의존성 배열에 loadMorePokemons가 직접적으로 참조하는 상태들 포함


  // --- 최초 로드 로직 (StrictMode 호환) ---
  useEffect(() => {
    console.log("DEBUG: useEffect - 초기 로드 상태 확인.", { page, loading, hasMore, initialLoadCompleted: initialLoadCompletedRef.current });

    if (initialLoadCompletedRef.current) {
      return; // 이미 초기 로드가 시작되었으면 아무것도 하지 않음 (StrictMode 중복 실행 방지)
    }

    // 조건: page가 0이고 (최초 로드), pokemons가 비어있으며, 현재 로딩 중이 아닐 때만
    if (page === 0 && pokemons.length === 0 && !loading && hasMore) {
      console.log("DEBUG: useEffect - 최초 1회 초기 데이터 로드 시작.");
      initialLoadCompletedRef.current = true; // 플래그를 true로 설정하여 다시는 실행되지 않도록 함
      loadMorePokemons();
    }
  }, [loadMorePokemons, page, pokemons.length, loading, hasMore]);


  // --- Intersection Observer 설정 ---
  useEffect(() => {
    console.log("DEBUG: useEffect - Intersection Observer 설정/재설정.");
    if (!observerRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      // 타겟 요소가 뷰포트에 진입했고, 현재 로딩 중이 아니며, 더 가져올 데이터가 있을 때만
      if (target.isIntersecting && !loading && hasMore) {
          console.log("DEBUG: Observer 감지 - 추가 API 호출 요청!");
          loadMorePokemons();
      }
    }, {
        threshold: 0.55, // 타겟 요소가 뷰포트에 55% 진입했을 때 콜백 실행
    });

    const currentObserverRef = observerRef.current;
    observer.observe(currentObserverRef);

    return () => {
        console.log("DEBUG: Observer 연결 해제.");
        observer.disconnect(); // 컴포넌트 언마운트 또는 의존성 변경 시 기존 옵저버 해제
    };
  }, [loading, hasMore, loadMorePokemons]);

  // 로딩 중일 때 초기 화면 표시
  if (loading && pokemons.length === 0) {
    // pokemons.length === 0은 초기 로딩 시에만 '로딩 중...'을 보여주기 위함
    return (
      <div className="app-container">
        <h1>InPokeDex</h1>
        <p>포켓몬 데이터를 불러오는 중...</p>
      </div>
    );
  }

  // 에러 발생 시 표시할 UI
  if (error && pokemons.length === 0) {
    // 초기 로딩 중 에러 시
    return (
      <div className="app-container">
        <h1>InPokeDex</h1>
        <p style={{ color: "red" }}>에러: {error}</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <h1>InPokeDex</h1>
      <div className="pokemon-grid">
        {pokemons.map((pokemon) => (
          <div key={pokemon.id} className="pokemon-card">
            <p>No. {pokemon.id}</p>
            <img
              src={pokemon.animatedImageUrl ? pokemon.animatedImageUrl : pokemon.defaultImageUrl}
              alt={pokemon.name}
            />
            <p>{pokemon.name}</p>
            <div className="pokemon-types">
              {pokemon.types.map((type, index) => (
                <span key={`${pokemon.id}-${index}`} className={`pokemon-type ${type}`}>
                  {type}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div ref={observerRef} style={{ padding: '20px', textAlign: 'center', fontSize: '1.2em' }}>
          {loading && pokemons.length > 0 && <p>더 많은 포켓몬 불러오는 중...</p>}
          {!loading && pokemons.length > 0 && !error && <p>...</p>}
        </div>
      )}
      {!hasMore && pokemons.length > 0 && !error && (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '1.2em', color: '#888' }}>
          <p>모든 포켓몬을 불러왔습니다!</p>
        </div>
      )}

      {error && pokemons.length > 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          <p>데이터를 불러오는 중 오류가 발생했습니다: {error}</p>
        </div>
      )}
    </div>
  );
}

export default App;
