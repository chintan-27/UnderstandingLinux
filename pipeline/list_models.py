"""List all models available on the configured proxy."""
import openai
from config import API_KEY, BASE_URL

client = openai.OpenAI(api_key=API_KEY, base_url=BASE_URL)

models = client.models.list()
for m in sorted(models.data, key=lambda x: x.id):
    print(m.id)
