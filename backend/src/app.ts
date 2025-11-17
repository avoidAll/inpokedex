import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;
const POKEAPI_BASE_URL = 'https://pokeapi.co/api/v2';

interface PokemonBasicInfo {
    id: string;
    name: string;
    types: string[]; // 영문 타입 이름 (예: "fire", "water")
    animatedImageUrl: string | null;
    defaultImageUrl: string;
}

let typeKoreanNames: { [key: string]: string } = {};

async function loadTypeTranslations() {
    try {
        console.log('[Backend Init] 모든 타입 정보 로딩 시작...');
        const typeListResponse = await axios.get(`${POKEAPI_BASE_URL}/type?limit=18`); // 공식타입은 18개
        const types = typeListResponse.data.results;

        await Promise.all(
            types.map(async (type: any) => {
                const typeDetailResponse = await axios.get(type.url);
                const koreanName = typeDetailResponse.data.names.find((name: any) => name.language.name === 'ko')?.name;
                if (koreanName) {
                    typeKoreanNames[type.name] = koreanName; // 영어 이름 -> 한글 이름 매핑
                }
            })
        );
        console.log('[Backend Init] 모든 타입 정보 로딩 완료:', Object.keys(typeKoreanNames).length, '개 타입');
    } catch (error) {
        if (error instanceof Error) {
            console.error('[Backend Init ERROR] 타입 정보를 로딩하는 중 오류 발생:', error.message);
        } else {
            console.error('[Backend Init ERROR] 알 수 없는 오류:', error);
        }
    }
}

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send('Hello from Backend!');
});

// 포켓몬 목록 API 엔드포인트
app.get('/api/pokemons', async (req, res) => {
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 20;

    console.log(`[Backend LOG] 프론트엔드에서 포켓몬 목록 요청: offset=${offset}, limit=${limit}`);

    try {
        // 1. PokeAPI에서 기본적인 포켓몬 목록 가져오기
        const listResponse = await axios.get(`${POKEAPI_BASE_URL}/pokemon?offset=${offset}&limit=${limit}`);
        const pokemonListItems = listResponse.data.results;

        // 2. 각 포켓몬에 대해 상세 정보 (기본 정보 + 종 정보)를 가져와서 가공
        const processedPokemons = await Promise.all(
            pokemonListItems.map(async (pokemonListItem: any) => {
                const parts = pokemonListItem.url.split('/');
                const id = parts[parts.length - 2];

                // Promise.all로 두 가지 상세 API 호출을 병렬로 처리
                const [pokemonDetailResponse, speciesResponse] = await Promise.all([
                    axios.get(`${POKEAPI_BASE_URL}/pokemon/${id}`),          // 기본 정보
                    axios.get(`${POKEAPI_BASE_URL}/pokemon-species/${id}`) // 종 정보 (한글 이름)
                ]);

                const pokemonData = pokemonDetailResponse.data; // 기본 정보 응답
                const speciesData = speciesResponse.data;       // 종 정보 응답

                // --- 한글 이름 추출 ---
                const koreanName = speciesData.names.find((name: any) => name.language.name === 'ko')?.name || pokemonListItem.name;

                // --- 속성 (타입) 추출 및 한글화 ---
                const types = pokemonData.types.map((typeInfo: any) => {
                    const englishTypeName = typeInfo.type.name;
                    return typeKoreanNames[englishTypeName] || englishTypeName; // 영문 이름 -> 한글 이름 매핑 사용
                });

                // --- 이미지 URL 추출 (움직이는 GIF 우선, 없을 시 다른 이미지) ---
                let animatedImageUrl: string | null = null;
                // 5세대 animated sprite (GIF) 확인
                if (pokemonData.sprites.versions && 
                    pokemonData.sprites.versions['generation-v'] &&
                    pokemonData.sprites.versions['generation-v']['black-white'] &&
                    pokemonData.sprites.versions['generation-v']['black-white'].animated &&
                    pokemonData.sprites.versions['generation-v']['black-white'].animated.front_default) {
                    animatedImageUrl = pokemonData.sprites.versions['generation-v']['black-white'].animated.front_default;
                }
                
                // 공식 일러스트 (artwork) 또는 일반 스프라이트를 기본으로 사용
                const defaultImageUrl = pokemonData.sprites.other?.['official-artwork']?.front_default ||
                                        pokemonData.sprites.front_default;

                return {
                    id: id,
                    name: koreanName, // 한글 이름 사용
                    types: types, 
                    animatedImageUrl: animatedImageUrl, // GIF 이미지 (null 가능)
                    defaultImageUrl: defaultImageUrl,   // 기본 정적 이미지 (항상 존재)
                };
            })
        );

        res.json({
            count: listResponse.data.count, // 전체 포켓몬 개수는 최초 목록 API에서 가져온 count
            results: processedPokemons      // 가공된 포켓몬 데이터 배열
        });

    } catch (error) {
        console.error(`[Backend ERROR] 포켓몬 목록을 가져오는 중 오류 발생:`, error instanceof Error ? error.message : String(error));
        res.status(500).json({ message: 'Failed to fetch pokemons' });
    }
});

// 포켓몬 상세 정보 API 엔드포인트
// 다만, 상세 정보에서도 타입을 한국어로 바꾸려면, 여기서도     ()를 사용해야 합니다.
app.get('/api/pokemon/:id', async (req, res) => {
    const pokemonId = req.params.id;

    try {
        const pokeApiUrl = `${POKEAPI_BASE_URL}/pokemon/${pokemonId}`;
        console.log(`[Backend LOG] PokeAPI에 상세 정보 요청: ${pokeApiUrl}`);

        const response = await axios.get(pokeApiUrl);
        const pokemonData = response.data;

        const speciesResponse = await axios.get(`${POKEAPI_BASE_URL}/pokemon-species/${pokemonId}`);
        const speciesData = speciesResponse.data;
        const koreanName = speciesData.names.find((name: any) => name.language.name === 'ko')?.name || pokemonData.name;

        // 타입 정보 가공 (영문 이름 그대로 사용)
        const types = pokemonData.types.map((typeInfo: any) => {
            const englishTypeName = typeInfo.type.name;
             return {
                englishName: englishTypeName,
                koreanName: typeKoreanNames[englishTypeName] || englishTypeName // 한글 이름 또는 영문 이름
            };
        });
        
        res.json({ ...pokemonData, name: koreanName, types: types });

    } catch (error) {
        if (error instanceof Error) {
            console.error(`[Backend ERROR] 포켓몬 ${pokemonId} 상세 정보를 가져오는 중 오류 발생:`, error.message);
        } else {
            console.error(`[Backend ERROR] 알 수 없는 오류:`, error);
        }
        res.status(500).json({ message: `Failed to fetch pokemon ${pokemonId}` });
    }
});


// --- 서버 리스닝 전에 타입 정보를 미리 로드 ---
app.listen(PORT, async () => {
    await loadTypeTranslations(); // 서버 시작 시 타입 번역 데이터 로드
    console.log(`Server is running on port ${PORT}`);
    console.log(`Backend URL: http://localhost:${PORT}`);
});