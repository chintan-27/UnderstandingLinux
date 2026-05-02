import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI-compatible API settings — configure in .env
API_KEY      = os.environ["OPENAI_API_KEY"]
BASE_URL     = os.environ.get("OPENAI_BASE_URL", "https://api.ai.it.ufl.edu")
DRAFT_MODEL  = os.environ.get("DRAFT_MODEL",  "gpt-3.5-turbo")
REFINE_MODEL = os.environ.get("REFINE_MODEL", "gpt-4o")

# Paths
BOOKS_DIR    = "books"       # put your PDFs here
DATA_DIR     = "data"
CHUNKS_DB    = "data/chunks.db"
MODULE_MAP   = "data/module_map.json"
OUTPUT_DIR   = "../understanding-linux/public/content/modules"

# Chunking
CHUNK_WORDS     = 1000   # target words per chunk
CHUNK_OVERLAP   = 100    # word overlap between chunks

# Maps short book keys (used in module_map.json) → actual PDF filename stems
BOOK_ALIASES = {
    "concrete_math": "Concrete Mathematics - Knuth, Graham, Patashnik",
    "strang":        "Introduction to Linear Algebra - Gilbert Strang",
    "ross":          "A First Course in Probability - Sheldon Ross",
    "feynman":       "Feynman Lectures on Physics - Vol I - Feynman",
    "kittel":        "Introduction to Solid State Physics - Kittel",
    "neamen":        "Semiconductor Physics and Devices - Neamen",
    "aoe":           "The Art of Electronics - Horowitz and Hill",
    "sedra":         "Microelectronic Circuits - Sedra and Smith",
    "harris":        "Digital Design and Computer Architecture - Harris and Harris",
    "pnh":           "Computer Organization and Design - Patterson and Hennessy",
    "hpca":          "Computer Architecture - A Quantitative Approach - Hennessy and Patterson",
    "knr":           "The C Programming Language - Kernighan and Ritchie",
    "csapp":         "Computer Systems - A Programmer's Perspective - Bryant and O'Hallaron",
    "levine":        "Linkers and Loaders - Levine",
    "ostep":         "Operating Systems - Three Easy Pieces - Arpaci-Dusseau",
    "tanenbaum_os":  "Modern Operating Systems - Tanenbaum",
    "tlcl":          "The Linux Command Line - William Shotts",
    "tlpi":          "The Linux Programming Interface - Michael Kerrisk",
    "lkd":           "Linux Kernel Development - Robert Love",
    "utlk":          "Understanding the Linux Kernel - Bovet and Cesati",
    "ldd3":          "Linux Device Drivers - Corbet, Rubini, Kroah-Hartman",
    "stevens_tcpip": "TCP-IP Illustrated Vol 1 - W. Richard Stevens",
    "unp":           "Unix Network Programming - Stevens",
    "tanenbaum_net": "Computer Networks - Tanenbaum",
    "gregg_sp":      "Systems Performance - Brendan Gregg",
    "gregg_bpf":     "BPF Performance Tools - Brendan Gregg",
}
