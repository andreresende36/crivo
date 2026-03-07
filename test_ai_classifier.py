import asyncio
from src.scraper.ml_classifier import classify_with_ai

async def main():
    cat = await classify_with_ai("Panela de Pressão Tramontina 4.5L")
    print(f"Result: {cat}")

if __name__ == "__main__":
    asyncio.run(main())
